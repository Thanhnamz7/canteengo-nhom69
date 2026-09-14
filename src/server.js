import http from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { openDatabase, openCloudDatabase, localDate } from "./db.js";
import { seed } from "./seed.js";
import { listenAvailable } from "./listen.js";
import {
  AppError,
  fail,
  requireRole,
  sessionUser,
  publicUser,
  makeSession,
  register,
  login,
  hashToken,
} from "./auth.js";
import {
  MenuService,
  InventoryService,
  OrderService,
  PaymentService,
  ReportService,
  updateProfile,
  updateAccount,
} from "./services.js";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export async function createApp(options = {}) {
  const config = {
    demoMode: process.env.DEMO_MODE !== "false",
    schoolDomain: process.env.SCHOOL_EMAIL_DOMAIN || "school.edu.vn",
    secure: process.env.VERCEL === "1" || process.env.COOKIE_SECURE === "true",
    polling: process.env.VERCEL === "1",
    ...options,
  };
  const db =
    options.db ||
    (process.env.TURSO_DATABASE_URL || process.env.VERCEL === "1"
      ? await openCloudDatabase(
          process.env.TURSO_DATABASE_URL,
          process.env.TURSO_AUTH_TOKEN,
        )
      : openDatabase(
          process.env.DB_PATH || resolve(root, "data/canteengo.sqlite"),
        ));
  await seed(db, config.demoMode);
  const menu = new MenuService(db),
    inventory = new InventoryService(db),
    orders = new OrderService(db),
    payment = new PaymentService(db, config.demoMode),
    reports = new ReportService(db);
  const clients = new Set();
  const cookie = (token) =>
    `canteengo=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${token ? 86400 : 0}${config.secure ? "; Secure" : ""}`;
  const json = (res, data, status = 200) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(data));
  };
  const broadcast = () => {
    for (const client of clients) {
      if (client.res.writableEnded || client.res.destroyed) {
        clients.delete(client);
        continue;
      }
      client.res.write("event: refresh\ndata: {}\n\n");
    }
  };
  const handler = async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https: data:; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
    );
    try {
      const url = new URL(req.url, "http://localhost");
      const path = url.pathname;
      const method = req.method;
      if (!path.startsWith("/api/")) {
        fail(
          method === "GET" || method === "HEAD",
          "Phương thức không được hỗ trợ.",
          405,
        );
        const asset =
          path === "/"
            ? "index.html"
            : decodeURIComponent(path).replace(/^\/+/, "");
        const file = resolve(root, "public", asset),
          publicRoot = resolve(root, "public") + sep;
        fail(file.startsWith(publicRoot), "Đường dẫn không hợp lệ.", 403);
        try {
          const body = await readFile(file);
          const types = {
            ".html": "text/html; charset=utf-8",
            ".css": "text/css; charset=utf-8",
            ".js": "text/javascript; charset=utf-8",
            ".svg": "image/svg+xml",
            ".jpg": "image/jpeg",
            ".png": "image/png",
          };
          res.writeHead(200, {
            "Content-Type": types[extname(file)] || "application/octet-stream",
            "Cache-Control": "no-cache",
          });
          res.end(method === "HEAD" ? undefined : body);
          return;
        } catch (e) {
          if (e.code === "ENOENT")
            throw new AppError("Không tìm thấy trang.", 404);
          throw e;
        }
      }
      let data = {};
      if (!["GET", "HEAD"].includes(method)) {
        fail(
          !req.headers.origin ||
            req.headers.origin ===
              `${config.secure ? "https" : "http"}://${req.headers.host}`,
          "Nguồn yêu cầu không hợp lệ.",
          403,
        );
        fail(
          (req.headers["content-type"] || "").split(";")[0] ===
            "application/json",
          "Yêu cầu cần định dạng JSON.",
          415,
        );
        let raw;
        if (req.body !== undefined) {
          raw =
            typeof req.body === "string" || Buffer.isBuffer(req.body)
              ? req.body.toString()
              : JSON.stringify(req.body);
        } else {
          const chunks = [];
          let length = 0;
          for await (const chunk of req) {
            length += chunk.length;
            fail(length <= 100000, "Yêu cầu quá lớn.", 413);
            chunks.push(chunk);
          }
          raw = Buffer.concat(chunks).toString("utf8");
        }
        fail(Buffer.byteLength(raw) <= 100000, "Yêu cầu quá lớn.", 413);
        try {
          data = JSON.parse(raw || "{}");
        } catch {
          throw new AppError("JSON không hợp lệ.");
        }
        fail(
          data && !Array.isArray(data) && typeof data === "object",
          "Dữ liệu cần là một đối tượng.",
        );
      }
      const user = await sessionUser(db, req.headers.cookie);
      let result;
      if (method === "GET" && path === "/api/config")
        result = {
          demoMode: config.demoMode,
          schoolDomain: config.schoolDomain,
          today: localDate(),
          inventoryEnabled: true,
          realtimeMode: config.polling ? "poll" : "sse",
          storage: db.remote ? "cloud" : "local",
        };
      else if (method === "GET" && path === "/api/me")
        result = {
          user: publicUser(user),
        };
      else if (
        method === "POST" &&
        ["/api/auth/register", "/api/auth/login"].includes(path)
      ) {
        const account = path.endsWith("register")
          ? await register(db, data, config)
          : await login(db, data, req.socket.remoteAddress);
        res.setHeader("Set-Cookie", cookie(await makeSession(db, account)));
        result = {
          user: publicUser(account),
        };
      } else if (method === "POST" && path === "/api/auth/logout") {
        const token = (req.headers.cookie || "")
          .split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith("canteengo="))
          ?.slice(10);
        if (token) {
          await db
            .prepare("DELETE FROM sessions WHERE token_hash=?")
            .run(hashToken(token));
          for (const c of clients)
            if (c.token === token) {
              clients.delete(c);
              c.res.end();
            }
        }
        res.setHeader("Set-Cookie", cookie(""));
        result = {
          ok: true,
        };
      } else if (method === "GET" && path === "/api/menu")
        result = await menu.list(url.searchParams.get("date") || localDate());
      else if (method === "GET" && /^\/api\/dishes\/[^/]+\/reviews$/.test(path))
        result = await db
          .prepare(
            "SELECT r.rating,r.comment,r.created_at,u.name FROM reviews r JOIN users u ON u.id=r.user_id WHERE r.dish_id=? ORDER BY r.created_at DESC LIMIT 50",
          )
          .all(path.split("/")[3]);
      else if (method === "GET" && path === "/api/slots")
        result = await orders.slots();
      else if (method === "GET" && path === "/api/events") {
        requireRole(user);
        if (config.polling) {
          json(res, { realtimeMode: "poll", interval: 5000 });
          return;
        }
        const token = (req.headers.cookie || "")
          .split(";")
          .map((s) => s.trim())
          .find((s) => s.startsWith("canteengo="))
          ?.slice(10);
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        });
        res.write("event: connected\ndata: {}\n\n");
        const client = {
          res,
          token,
        };
        clients.add(client);
        const cleanup = () => {
          clients.delete(client);
          clearInterval(heartbeat);
        };
        const heartbeat = setInterval(async () => {
          if (
            res.writableEnded ||
            res.destroyed ||
            !(await sessionUser(db, req.headers.cookie))
          ) {
            cleanup();
            res.end();
            return;
          }
          res.write(": heartbeat\n\n");
        }, 15000);
        res.on("error", cleanup);
        res.on("close", cleanup);
        req.on("close", cleanup);
        return;
      } else if (method === "PUT" && path === "/api/profile")
        result = await updateProfile(db, user, data);
      else if (method === "GET" && path === "/api/orders")
        result = await orders.list(user);
      else if (method === "POST" && path === "/api/orders")
        result = await orders.checkout(user, data);
      else if (method === "GET" && /^\/api\/orders\/[^/]+$/.test(path))
        result = await orders.detail(user, path.split("/")[3]);
      else if (method === "POST" && /^\/api\/orders\/[^/]+\/status$/.test(path))
        result = await orders.transition(user, path.split("/")[3], data);
      else if (
        method === "POST" &&
        /^\/api\/orders\/[^/]+\/reviews$/.test(path)
      )
        result = await orders.review(user, path.split("/")[3], data);
      else if (method === "POST" && path === "/api/wallet/topup")
        result = await payment.topup(user, data);
      else if (method === "GET" && path === "/api/wallet/history")
        result = await payment.history(user);
      else if (method === "GET" && path === "/api/inventory")
        result = await inventory.list(user);
      else if (method === "GET" && path === "/api/inventory/history")
        result = await inventory.history(user);
      else if (method === "POST" && path === "/api/inventory/adjust")
        result = await inventory.adjust(user, data);
      else if (method === "GET" && path === "/api/suppliers") {
        requireRole(user, "staff", "admin");
        result = await db
          .prepare("SELECT * FROM suppliers ORDER BY name")
          .all();
      } else if (method === "POST" && path === "/api/admin/ingredients")
        result = await inventory.saveIngredient(user, null, data);
      else if (
        method === "PUT" &&
        /^\/api\/admin\/ingredients\/[^/]+$/.test(path)
      )
        result = await inventory.saveIngredient(user, path.split("/")[4], data);
      else if (method === "POST" && path === "/api/admin/suppliers")
        result = await inventory.saveSupplier(user, null, data);
      else if (
        method === "PUT" &&
        /^\/api\/admin\/suppliers\/[^/]+$/.test(path)
      )
        result = await inventory.saveSupplier(user, path.split("/")[4], data);
      else if (method === "GET" && path === "/api/admin/menu") {
        requireRole(user, "admin");
        result = await menu.list(
          url.searchParams.get("date") || localDate(),
          true,
        );
      } else if (method === "POST" && path === "/api/admin/menu")
        result = await menu.save(user, null, data);
      else if (method === "PUT" && /^\/api\/admin\/menu\/[^/]+$/.test(path))
        result = await menu.save(user, path.split("/")[4], data);
      else if (method === "DELETE" && /^\/api\/admin\/menu\/[^/]+$/.test(path))
        result = await menu.remove(user, path.split("/")[4]);
      else if (method === "PUT" && /^\/api\/admin\/recipes\/[^/]+$/.test(path))
        result = await inventory.saveRecipe(user, path.split("/")[4], data);
      else if (method === "GET" && path === "/api/admin/reports")
        result = await reports.summary(
          user,
          url.searchParams.get("from"),
          url.searchParams.get("to"),
        );
      else if (method === "GET" && path === "/api/admin/users") {
        requireRole(user, "admin");
        result = (
          await db.prepare("SELECT * FROM users ORDER BY created_at DESC").all()
        ).map(publicUser);
      } else if (method === "PUT" && /^\/api\/admin\/users\/[^/]+$/.test(path))
        result = await updateAccount(db, user, path.split("/")[4], data);
      else if (method === "GET" && path === "/api/admin/audit") {
        requireRole(user, "admin");
        result = await db
          .prepare(
            "SELECT a.*,u.name actor_name FROM audit_log a JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200",
          )
          .all();
      } else throw new AppError("Không tìm thấy chức năng.", 404);
      json(res, result);
      if (!["GET", "HEAD"].includes(method)) broadcast();
    } catch (error) {
      if (!error.status) console.error(error);
      if (!res.headersSent)
        json(
          res,
          {
            error: error.status
              ? error.message
              : "Máy chủ gặp lỗi. Dữ liệu giao dịch chưa hoàn tất đã được khôi phục.",
          },
          error.status || 500,
        );
      else res.end();
    }
  };
  const server = http.createServer(handler);
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  return {
    server,
    handler,
    db,
    close: () => {
      for (const c of clients) c.res.end();
      return new Promise((r) =>
        server.close(() => {
          db.close();
          r();
        }),
      );
    },
  };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const app = await createApp();
  const port = Number(process.env.PORT || 3000);
  const host = process.env.HOST || "127.0.0.1";
  try {
    const actualPort = await listenAvailable(app.server, {
      port,
      host,
      onBusy: (busyPort) =>
        console.log(`Cổng ${busyPort} đang được dùng. Đang thử cổng kế tiếp…`),
    });
    console.log(
      `CanteenGo đang chạy tại http://${host}:${actualPort} — ${process.env.DEMO_MODE === "false" ? "chế độ thường" : "ví và dữ liệu giả lập"}`,
    );
    console.log(
      "Mở đúng địa chỉ ở dòng trên trong trình duyệt. Nhấn Ctrl+C để dừng.",
    );
  } catch (error) {
    console.error(`Không thể khởi động CanteenGo: ${error.message}`);
    app.db.close();
    process.exitCode = 1;
  }
  process.on("SIGINT", async () => {
    await app.close();
    process.exit(0);
  });
  process.on("SIGTERM", async () => {
    await app.close();
    process.exit(0);
  });
}
