import { DatabaseSync } from "node:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";
const schema = () =>
  readFileSync(new URL("./schema.sql", import.meta.url), "utf8");

// Serialize unrelated operations. Each async transaction has its own context.
function adapter(connection, remote = false) {
  const context = new AsyncLocalStorage();
  let tail = Promise.resolve();
  const exclusive = (callback) => {
    const pending = tail.then(callback);
    tail = pending.catch(() => {});
    return pending;
  };
  const execute = async (target, sql, args, mode) => {
    if (!remote) return target.prepare(sql)[mode](...args);
    const result = await target.execute({ sql, args });
    if (mode === "run")
      return {
        changes: result.rowsAffected,
        lastInsertRowid: result.lastInsertRowid,
      };
    const rows = result.rows.map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([key, value]) => [
          key,
          typeof value === "bigint" ? Number(value) : value,
        ]),
      ),
    );
    return mode === "get" ? rows[0] : rows;
  };
  const db = {
    remote,
    prepare(sql) {
      return Object.fromEntries(
        ["run", "get", "all"].map((mode) => [
          mode,
          (...args) => {
            const active = context.getStore();
            return active
              ? execute(active, sql, args, mode)
              : exclusive(() => execute(connection, sql, args, mode));
          },
        ]),
      );
    },
    exec(sql) {
      const active = context.getStore();
      const run = (target) =>
        remote ? target.executeMultiple(sql) : target.exec(sql);
      return active ? run(active) : exclusive(() => run(connection));
    },
    async batch(statements) {
      const active = context.getStore();
      if (remote && active) return active.batch(statements);
      if (remote && !active)
        return exclusive(() => connection.batch(statements, "write"));
      return db.transaction(async () => {
        for (const statement of statements)
          await db.prepare(statement.sql).run(...statement.args);
      });
    },
    transaction(callback) {
      if (context.getStore()) return callback();
      return exclusive(async () => {
        const target = remote
          ? await connection.transaction("write")
          : connection;
        if (!remote) connection.exec("BEGIN IMMEDIATE");
        try {
          const result = await context.run(target, callback);
          if (remote) await target.commit();
          else connection.exec("COMMIT");
          return result;
        } catch (error) {
          try {
            if (remote) await target.rollback();
            else connection.exec("ROLLBACK");
          } catch {}
          throw error;
        } finally {
          if (remote) target.close();
        }
      });
    },
    close() {
      connection.close();
    },
  };
  return db;
}
export function openDatabase(path) {
  if (path !== ":memory:") mkdirSync(dirname(path), { recursive: true });
  const connection = new DatabaseSync(path, { timeout: 5000 });
  connection.exec(
    "PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;",
  );
  connection.exec(schema());
  return adapter(connection);
}
export async function openCloudDatabase(url, authToken) {
  if (!url || !authToken)
    throw new Error("Thiếu TURSO_DATABASE_URL hoặc TURSO_AUTH_TOKEN.");
  const { createClient } = await import("@libsql/client");
  const client = createClient({ url, authToken, intMode: "number" });
  await client.executeMultiple(schema());
  return adapter(client, true);
}
export function transaction(db, callback) {
  return db.transaction(callback);
}
export function localDate(date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}
const slotDays = new WeakMap();
export async function ensureSlots(db) {
  const today = localDate();
  if (slotDays.get(db) === today) return;
  const statements = [];
  for (let d = 0; d < 7; d++) {
    const date = localDate(new Date(Date.now() + d * 86400000));
    for (let m = 630; m < 840; m += 15) {
      const time = (n) =>
        `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
      statements.push({
        sql: "INSERT OR IGNORE INTO slots(id, starts_at, ends_at, capacity) VALUES(?,?,?,20)",
        args: [
          `${date}-${time(m)}`,
          `${date}T${time(m)}:00+07:00`,
          `${date}T${time(m + 15)}:00+07:00`,
        ],
      });
    }
  }
  await db.batch(statements);
  slotDays.set(db, today);
}
