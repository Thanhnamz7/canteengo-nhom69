import {
  randomBytes,
  randomUUID,
  scrypt as rawScrypt,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";
import { transaction } from "./db.js";
const scrypt = promisify(rawScrypt);
export class AppError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}
export const fail = (condition, message, status = 400) => {
  if (!condition) throw new AppError(message, status);
};
export const hashToken = (value) =>
  createHash("sha256").update(value).digest("hex");
export async function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${(await scrypt(password, salt, 64)).toString("hex")}`;
}
export async function verifyPassword(password, hash) {
  const [salt, key] = hash.split(":");
  const derived = await scrypt(password, salt, 64);
  return timingSafeEqual(Buffer.from(key, "hex"), derived);
}
export const publicUser = (u) =>
  u && {
    id: u.id,
    name: u.name,
    email: u.email,
    phone: u.phone,
    role: u.role,
    kind: u.kind,
    allergies: u.allergies,
    balance: u.balance,
    active: u.active,
  };
export async function sessionUser(db, cookie = "") {
  const token = cookie
    .split(";")
    .map((s) => s.trim())
    .find((s) => s.startsWith("canteengo="))
    ?.slice(10);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return (
    (await db
      .prepare(
        "SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND u.active=1",
      )
      .get(hashToken(token), Date.now())) || null
  );
}
export function requireRole(user, ...roles) {
  fail(user, "Vui lòng đăng nhập.", 401);
  fail(
    !roles.length || roles.includes(user.role),
    "Bạn không có quyền thực hiện thao tác này.",
    403,
  );
}
export async function makeSession(db, user) {
  const token = randomBytes(32).toString("hex");
  await db.prepare("DELETE FROM sessions WHERE expires_at<?").run(Date.now());
  await db
    .prepare("INSERT INTO sessions VALUES(?,?,?)")
    .run(hashToken(token), user.id, Date.now() + 86400000);
  return token;
}
export async function register(db, data, config) {
  const name = String(data.name || "").trim();
  const email =
    String(data.email || "")
      .trim()
      .toLowerCase() || null;
  const phone = String(data.phone || "").trim() || null;
  const kind = data.kind === "school" ? "school" : "external";
  fail(name.length >= 2 && name.length <= 100, "Tên cần có 2–100 ký tự.");
  fail(email || phone, "Nhập email hoặc số điện thoại.");
  fail(
    !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    "Email không hợp lệ.",
  );
  fail(
    !phone || /^(0\d{9}|\+84\d{9})$/.test(phone),
    "Số điện thoại không hợp lệ.",
  );
  fail(
    kind !== "school" || (email && email.endsWith("@" + config.schoolDomain)),
    `Email trường phải thuộc @${config.schoolDomain}.`,
  );
  fail(
    typeof data.password === "string" &&
      data.password.length >= 8 &&
      data.password.length <= 128,
    "Mật khẩu cần có 8–128 ký tự.",
  );
  const passwordHash = await hashPassword(data.password);
  const id = randomUUID();
  await transaction(db, async () => {
    fail(
      !(await db
        .prepare("SELECT id FROM users WHERE email=? OR phone=?")
        .get(email, phone)),
      "Email hoặc số điện thoại đã được sử dụng.",
      409,
    );
    await db
      .prepare(
        "INSERT INTO users(id,name,email,phone,password_hash,role,kind) VALUES(?,?,?,?,?,?,?)",
      )
      .run(id, name, email, phone, passwordHash, "customer", kind);
  });
  return await db.prepare("SELECT * FROM users WHERE id=?").get(id);
}
export async function login(db, data, ip) {
  const identity = String(data.identity || "")
    .trim()
    .toLowerCase();
  fail(
    identity.length <= 254 &&
      (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity) ||
        /^(0\d{9}|\+84\d{9})$/.test(identity)),
    "Nhập email hoặc số điện thoại hợp lệ.",
  );
  fail(
    typeof data.password === "string" &&
      data.password.length > 0 &&
      data.password.length <= 128,
    "Vui lòng nhập mật khẩu hợp lệ.",
  );
  const key = hashToken(`${ip}:${identity}`);
  const checkLock = async () =>
    fail(
      !(
        (await db.prepare("SELECT * FROM login_attempts WHERE key=?").get(key))
          ?.locked_until > Date.now()
      ),
      "Sai mật khẩu 3 lần. Vui lòng thử lại sau 60 giây.",
      429,
    );
  await checkLock();
  const user = await db
    .prepare("SELECT * FROM users WHERE email=? OR phone=?")
    .get(identity, identity);
  const valid = await verifyPassword(
    data.password,
    user?.password_hash ||
      "00000000000000000000000000000000:" + "00".repeat(64),
  );
  // Recheck after asynchronous password hashing to enforce concurrent failure limits.
  await checkLock();
  if (!user || !valid || !user.active) {
    await transaction(db, async () => {
      const prev = await db
        .prepare("SELECT * FROM login_attempts WHERE key=?")
        .get(key);
      const count = prev && prev.locked_until === 0 ? prev.attempts + 1 : 1;
      await db
        .prepare("INSERT OR REPLACE INTO login_attempts VALUES(?,?,?)")
        .run(key, count, count >= 3 ? Date.now() + 60000 : 0);
    });
    throw new AppError(
      "Thông tin đăng nhập không đúng hoặc tài khoản bị khóa.",
      401,
    );
  }
  await db.prepare("DELETE FROM login_attempts WHERE key=?").run(key);
  return user;
}
