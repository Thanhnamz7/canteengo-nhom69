import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/server.js";
import { openDatabase } from "../src/db.js";
async function setup(t) {
  const app = await createApp({
    db: openDatabase(":memory:"),
  });
  await new Promise((r) => app.server.listen(0, "127.0.0.1", r));
  t.after(() => app.close());
  const base = `http://127.0.0.1:${app.server.address().port}`;
  async function request(path, method = "GET", data, cookie = "", extra = {}) {
    const response = await fetch(base + path, {
      method,
      headers: {
        ...(data === undefined
          ? {}
          : {
              "Content-Type": "application/json",
            }),
        Cookie: cookie,
        ...extra,
      },
      body: data === undefined ? undefined : JSON.stringify(data),
    });
    const body = (response.headers.get("content-type") || "").includes("json")
      ? await response.json()
      : await response.text();
    return {
      status: response.status,
      body,
      headers: response.headers,
    };
  }
  const signIn = async (role) => {
    const email = {
      customer: "student@school.edu.vn",
      staff: "staff@canteengo.vn",
      admin: "admin@canteengo.vn",
    }[role];
    const result = await request("/api/auth/login", "POST", {
      identity: email,
      password: "Canteen@123",
    });
    assert.equal(result.status, 200);
    return result.headers.get("set-cookie").split(";")[0];
  };
  return {
    app,
    base,
    request,
    signIn,
  };
}
test("HTTP01 — cookie HttpOnly, phiên đăng nhập, đăng xuất", async (t) => {
  const f = await setup(t);
  const login = await f.request("/api/auth/login", "POST", {
    identity: "student@school.edu.vn",
    password: "Canteen@123",
  });
  assert.match(login.headers.get("set-cookie"), /HttpOnly/);
  assert.match(login.headers.get("set-cookie"), /SameSite=Strict/);
  assert.equal(login.body.user.password_hash, undefined);
  const cookie = login.headers.get("set-cookie").split(";")[0];
  assert.equal(
    (await f.request("/api/me", "GET", undefined, cookie)).body.user.role,
    "customer",
  );
  await f.request("/api/auth/logout", "POST", {}, cookie);
  assert.equal(
    (await f.request("/api/orders", "GET", undefined, cookie)).status,
    401,
  );
});
test("HTTP02 — cấm CSRF, JSON sai và truy cập vận hành trái quyền", async (t) => {
  const f = await setup(t);
  const cookie = await f.signIn("customer");
  assert.equal(
    (await f.request("/api/admin/menu", "GET", undefined, cookie)).status,
    403,
  );
  assert.equal((await f.request("/api/orders")).status, 401);
  assert.equal(
    (
      await f.request(
        "/api/wallet/topup",
        "POST",
        {
          amount: 100000,
          reference: randomUUID(),
        },
        cookie,
        {
          Origin: "https://foreign.example",
        },
      )
    ).status,
    403,
  );
  const malformed = await fetch(f.base + "/api/auth/login", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: "{",
  });
  assert.equal(malformed.status, 400);
});
test("HTTP03 — static, ảnh và header bảo vệ chạy không phụ thuộc CDN", async (t) => {
  const f = await setup(t);
  const result = await f.request("/");
  assert.equal(result.status, 200);
  assert.match(result.body, /lang="vi"/);
  assert.match(
    result.headers.get("content-security-policy"),
    /script-src 'self'/,
  );
  for (const file of [
    "/app.js",
    "/style.css",
    "/assets/rice.jpg",
    "/assets/pho.jpg",
    "/assets/bread.png",
    "/assets/tea.jpg",
    "/assets/milk.jpg",
  ])
    assert.equal((await fetch(f.base + file)).status, 200);
});
test("HTTP04 — đặt món → bếp → giao → đánh giá → báo cáo", async (t) => {
  const f = await setup(t);
  const customer = await f.signIn("customer"),
    staff = await f.signIn("staff"),
    admin = await f.signIn("admin");
  const slots = (await f.request("/api/slots")).body;
  const data = {
    reference: randomUUID(),
    slot_id: slots[0].id,
    items: [
      {
        dish_id: "beef-pho",
        price: 40000,
        quantity: 1,
        note: "Không hành",
      },
    ],
  };
  const result = await f.request("/api/orders", "POST", data, customer);
  assert.equal(result.status, 200);
  const id = result.body.id;
  for (const [expected_status, status] of [
    ["pending", "preparing"],
    ["preparing", "ready"],
    ["ready", "completed"],
  ])
    assert.equal(
      (
        await f.request(
          `/api/orders/${id}/status`,
          "POST",
          {
            expected_status,
            status,
          },
          staff,
        )
      ).status,
      200,
    );
  assert.equal(
    (
      await f.request(
        `/api/orders/${id}/reviews`,
        "POST",
        {
          dish_id: "beef-pho",
          rating: 5,
          comment: "Ngon",
        },
        customer,
      )
    ).status,
    200,
  );
  const report = (
    await f.request(
      "/api/admin/reports?from=2020-01-01&to=2099-12-31",
      "GET",
      undefined,
      admin,
    )
  ).body;
  assert.equal(report.revenue, 40000);
  assert.equal(report.completed, 1);
  assert.equal(
    (await f.request("/api/me", "GET", undefined, customer)).body.user.balance,
    160000,
  );
});
test("HTTP05 — SSE thông báo thay đổi và không lộ dữ liệu người khác", async (t) => {
  const f = await setup(t);
  const customer = await f.signIn("customer");
  const abort = new AbortController();
  const response = await fetch(f.base + "/api/events", {
    headers: {
      Cookie: customer,
    },
    signal: abort.signal,
  });
  assert.equal(response.headers.get("content-type"), "text/event-stream");
  const reader = response.body.getReader();
  const first = await reader.read();
  assert.match(new TextDecoder().decode(first.value), /connected/);
  await f.request(
    "/api/wallet/topup",
    "POST",
    {
      amount: 10000,
      reference: randomUUID(),
    },
    customer,
  );
  const changed = await reader.read();
  const content = new TextDecoder().decode(changed.value);
  assert.match(content, /event: refresh/);
  assert.doesNotMatch(content, /balance|email|customer_name/);
  abort.abort();
});
test("HTTP06 — khóa tài khoản thu hồi phiên ngay", async (t) => {
  const f = await setup(t);
  const customer = await f.signIn("customer"),
    admin = await f.signIn("admin");
  assert.equal(
    (
      await f.request(
        "/api/admin/users/demo-customer",
        "PUT",
        {
          role: "customer",
          active: false,
        },
        admin,
      )
    ).status,
    200,
  );
  assert.equal(
    (await f.request("/api/orders", "GET", undefined, customer)).status,
    401,
  );
});
test("HTTP07 — đăng xuất khi SSE còn mở không làm máy chủ ghi vào stream đã đóng", async (t) => {
  const f = await setup(t);
  const customer = await f.signIn("customer");
  const stream = await fetch(f.base + "/api/events", {
    headers: {
      Cookie: customer,
    },
  });
  const reader = stream.body.getReader();
  await reader.read();
  assert.equal(
    (await f.request("/api/auth/logout", "POST", {}, customer)).status,
    200,
  );
  assert.equal((await reader.read()).done, true);
  assert.equal((await f.request("/api/config")).status, 200);
  assert.ok(await f.signIn("staff"));
});
