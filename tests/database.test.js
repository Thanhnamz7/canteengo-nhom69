import { test } from "node:test";
import assert from "node:assert/strict";
import { openDatabase, openCloudDatabase, transaction } from "../src/db.js";
import { seed } from "../src/seed.js";

test("DB01 — yêu cầu khác không đọc dữ liệu chưa commit qua cùng kết nối", async (t) => {
  const db = openDatabase(":memory:");
  t.after(() => db.close());
  await seed(db);
  let unlock, entered;
  const gate = new Promise((resolve) => {
    unlock = resolve;
  });
  const started = new Promise((resolve) => {
    entered = resolve;
  });
  const writing = transaction(db, async () => {
    await db
      .prepare("UPDATE users SET balance=1 WHERE id='demo-customer'")
      .run();
    entered();
    await gate;
    throw new Error("rollback test");
  });
  const rejected = assert.rejects(writing, /rollback test/);
  await started;
  const reading = db
    .prepare("SELECT balance FROM users WHERE id='demo-customer'")
    .get();
  unlock();
  await rejected;
  assert.equal((await reading).balance, 200000);
});

test("DB02 — libSQL adapter khởi tạo batch, seed lặp và rollback giao dịch", async (t) => {
  const db = await openCloudDatabase("file::memory:", "local-test");
  t.after(() => db.close());
  await seed(db);
  await seed(db);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM users").get()).n, 3);
  assert.equal((await db.prepare("SELECT COUNT(*) n FROM dishes").get()).n, 7);
  await assert.rejects(
    transaction(db, async () => {
      await db
        .prepare("UPDATE users SET balance=0 WHERE id='demo-customer'")
        .run();
      throw new Error("rollback cloud");
    }),
    /rollback cloud/,
  );
  assert.equal(
    (
      await db
        .prepare("SELECT balance FROM users WHERE id='demo-customer'")
        .get()
    ).balance,
    200000,
  );
});
