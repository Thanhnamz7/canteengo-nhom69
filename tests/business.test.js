import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Worker } from "node:worker_threads";
import { openDatabase, localDate } from "../src/db.js";
import { seed } from "../src/seed.js";
import { login, register } from "../src/auth.js";
import {
  MenuService,
  InventoryService,
  OrderService,
  PaymentService,
  ReportService,
  updateAccount,
} from "../src/services.js";
async function fixture(t, path = ":memory:") {
  const db = openDatabase(path);
  await seed(db);
  t.after(() => db.close());
  const customer = await db
      .prepare("SELECT * FROM users WHERE role='customer'")
      .get(),
    staff = await db.prepare("SELECT * FROM users WHERE role='staff'").get(),
    admin = await db.prepare("SELECT * FROM users WHERE role='admin'").get();
  const order = new OrderService(db),
    inventory = new InventoryService(db),
    menu = new MenuService(db),
    payment = new PaymentService(db, true),
    report = new ReportService(db);
  const slot = (await order.slots())[0];
  const request = async (
    dish = "chicken-rice",
    count = 1,
    reference = randomUUID(),
  ) => ({
    reference,
    slot_id: slot.id,
    items: [
      {
        dish_id: dish,
        price: (
          await db.prepare("SELECT price FROM dishes WHERE id=?").get(dish)
        ).price,
        quantity: count,
        note: "Không hành",
      },
    ],
  });
  const buy = async (dish, count) =>
    await order.checkout(customer, await request(dish, count));
  const move = async (o, status, actor = staff, reason = "Lý do kiểm thử") =>
    await order.transition(actor, o.id, {
      expected_status: o.status,
      status,
      reason,
    });
  const stock = async (id) =>
    (await db.prepare("SELECT stock FROM ingredients WHERE id=?").get(id))
      .stock / 1000;
  const setStock = async (id, amount) =>
    await db
      .prepare("UPDATE ingredients SET stock=? WHERE id=?")
      .run(amount * 1000, id);
  const balance = async () =>
    (await db.prepare("SELECT balance FROM users WHERE id=?").get(customer.id))
      .balance;
  const recipe = async (rice = 150, chicken = 100) =>
    await inventory.saveRecipe(admin, "chicken-rice", {
      lines: [
        {
          ingredient_id: "rice",
          unit: "g",
          quantity: rice,
        },
        {
          ingredient_id: "chicken",
          unit: "g",
          quantity: chicken,
        },
      ],
    });
  return {
    db,
    customer,
    staff,
    admin,
    order,
    inventory,
    menu,
    payment,
    report,
    slot,
    request,
    buy,
    move,
    stock,
    setStock,
    balance,
    recipe,
  };
}
test("TC01 — đăng nhập đúng trả về đúng vai trò", async (t) => {
  const f = await fixture(t);
  for (const [identity, role] of [
    ["student@school.edu.vn", "customer"],
    ["staff@canteengo.vn", "staff"],
    ["admin@canteengo.vn", "admin"],
  ])
    assert.equal(
      (
        await login(
          f.db,
          {
            identity,
            password: "Canteen@123",
          },
          "test",
        )
      ).role,
      role,
    );
});
test("TC02 — ba lần sai, khóa lần tiếp theo trong 60 giây", async (t) => {
  const f = await fixture(t);
  const data = {
    identity: f.customer.email,
    password: "invalid",
  };
  for (let i = 0; i < 3; i++)
    await assert.rejects(login(f.db, data, "test"), {
      status: 401,
    });
  await assert.rejects(
    login(
      f.db,
      {
        ...data,
        password: "Canteen@123",
      },
      "test",
    ),
    {
      status: 429,
    },
  );
  assert.equal(
    (await f.db.prepare("SELECT COUNT(*) n FROM sessions").get()).n,
    0,
  );
});
test("TC03 — từ chối email rỗng hoặc sai định dạng", async (t) => {
  const f = await fixture(t);
  for (const identity of ["", "abc", "test@"])
    await assert.rejects(
      login(
        f.db,
        {
          identity,
          password: "pass",
        },
        "test",
      ),
      {
        status: 400,
      },
    );
});
test("TC04 — 2 suất lưu đúng số lượng, giá, ghi chú và tổng", async (t) => {
  const f = await fixture(t);
  const o = await f.buy("chicken-rice", 2);
  assert.equal(o.total, 70000);
  assert.equal(o.items[0].quantity, 2);
  assert.equal(o.items[0].note, "Không hành");
  assert.equal(await f.balance(), 130000);
});
test("TC05 — món vừa hết bị chặn lúc chốt đơn", async (t) => {
  const f = await fixture(t);
  const body = await f.request();
  await f.db
    .prepare("UPDATE dishes SET available=0 WHERE id='chicken-rice'")
    .run();
  await assert.rejects(async () => await f.order.checkout(f.customer, body), {
    status: 409,
  });
  assert.equal(await f.balance(), 200000);
});
test("TC06 — không nhận lượng 0, âm, lẻ hoặc chuỗi", async (t) => {
  const f = await fixture(t);
  for (const q of [0, -1, 1.5, "2", 100])
    await assert.rejects(
      async () =>
        await f.order.checkout(f.customer, await f.request("chicken-rice", q)),
      {
        status: 400,
      },
    );
  assert.equal(
    (await f.db.prepare("SELECT COUNT(*) n FROM orders").get()).n,
    0,
  );
});
test("TC07 — slot đầy hoặc quá giờ không tạo đơn", async (t) => {
  const f = await fixture(t);
  await f.db.prepare("UPDATE slots SET capacity=1 WHERE id=?").run(f.slot.id);
  await f.buy();
  await assert.rejects(async () => await f.buy(), {
    status: 409,
  });
  await f.db
    .prepare(
      "UPDATE slots SET starts_at='2020-01-01T11:00:00+07:00' WHERE id=?",
    )
    .run(f.slot.id);
  await assert.rejects(async () => await f.buy(), {
    status: 409,
  });
  assert.equal(await f.balance(), 165000);
});
test("TC08 — ví 100000, đơn 40000, còn 60000 và một thanh toán", async (t) => {
  const f = await fixture(t);
  await f.db
    .prepare("UPDATE users SET balance=100000 WHERE id=?")
    .run(f.customer.id);
  const o = await f.buy("beef-pho");
  assert.equal(await f.balance(), 60000);
  assert.equal(o.status, "pending");
  assert.equal(
    (
      await f.db
        .prepare("SELECT COUNT(*) n FROM payments WHERE type='payment'")
        .get()
    ).n,
    1,
  );
});
test("TC09 — ví thiếu tiền không thay đổi dữ liệu", async (t) => {
  const f = await fixture(t);
  await f.db
    .prepare("UPDATE users SET balance=20000 WHERE id=?")
    .run(f.customer.id);
  await assert.rejects(async () => await f.buy("beef-pho"), {
    status: 409,
  });
  assert.equal(await f.balance(), 20000);
  assert.equal(
    (await f.db.prepare("SELECT COUNT(*) n FROM orders").get()).n,
    0,
  );
});
test("TC10 — gửi lặp thanh toán trả cùng đơn, không trừ lặp; ref khác nội dung bị chặn", async (t) => {
  const f = await fixture(t);
  const body = await f.request();
  const a = await f.order.checkout(f.customer, body),
    b = await f.order.checkout(f.customer, body);
  assert.equal(a.id, b.id);
  assert.equal(await f.balance(), 165000);
  await assert.rejects(
    async () =>
      await f.order.checkout(f.customer, {
        ...body,
        items: [
          {
            ...body.items[0],
            quantity: 2,
          },
        ],
      }),
    {
      status: 409,
    },
  );
  assert.equal(
    (
      await f.db
        .prepare("SELECT COUNT(*) n FROM payments WHERE type='payment'")
        .get()
    ).n,
    1,
  );
});
test("TC11 — nhận đơn trừ đúng nguyên liệu và không trừ lặp", async (t) => {
  const f = await fixture(t);
  const o = await f.buy();
  const start = await f.stock("rice");
  const p = await f.move(o, "preparing");
  assert.equal(p.status, "preparing");
  assert.equal(await f.stock("rice"), start - 150);
  await assert.rejects(async () => await f.move(o, "preparing"), {
    status: 409,
  });
  assert.equal(await f.stock("rice"), start - 150);
});
test("TC12 — từ chối đơn hoàn tiền, giải phóng chỗ, không hoàn kho", async (t) => {
  const f = await fixture(t);
  const o = await f.buy();
  const before = await f.stock("rice");
  const c = await f.move(o, "cancelled");
  assert.equal(c.status, "cancelled");
  assert.equal(await f.balance(), 200000);
  assert.equal(await f.stock("rice"), before);
  assert.equal((await f.order.slots()).find((s) => s.id === f.slot.id).used, 0);
  assert.equal(
    (
      await f.db
        .prepare("SELECT COUNT(*) n FROM stock_movements WHERE type='restore'")
        .get()
    ).n,
    0,
  );
  await assert.rejects(async () => await f.move(o, "cancelled"), {
    status: 409,
  });
  assert.equal(await f.balance(), 200000);
});
test("TC13 — chỉ chuyển đúng thứ tự, không giao lần hai", async (t) => {
  const f = await fixture(t);
  const o = await f.buy();
  await assert.rejects(async () => await f.move(o, "completed"), {
    status: 409,
  });
  const p = await f.move(o, "preparing"),
    r = await f.move(p, "ready"),
    c = await f.move(r, "completed");
  assert.equal(c.history.length, 4);
  assert.ok(c.completed_at);
  await assert.rejects(async () => await f.move(c, "completed"), {
    status: 409,
  });
});
test("TC14 — 2 đơn hoàn tất 30000 + 40000; đơn hủy không vào doanh thu", async (t) => {
  const f = await fixture(t);
  await f.db
    .prepare("UPDATE dishes SET price=30000 WHERE id='chicken-rice'")
    .run();
  for (const dish of ["chicken-rice", "beef-pho"])
    await f.move(
      await f.move(await f.move(await f.buy(dish), "preparing"), "ready"),
      "completed",
    );
  await f.move(await f.buy("egg-bread"), "cancelled");
  const report = await f.report.summary(f.admin, localDate(), localDate());
  assert.equal(report.completed, 2);
  assert.equal(report.revenue, 70000);
  assert.equal(report.dishes.find((d) => d.id === "egg-bread").revenue, 0);
});
test("TC15 — báo cáo ngày trống trả 0", async (t) => {
  const f = await fixture(t);
  const report = await f.report.summary(f.admin, "2020-01-01", "2020-01-01");
  assert.equal(report.revenue, 0);
  assert.equal(report.completed, 0);
  assert.deepEqual(report.daily, []);
});
test("TC16 — đánh giá đơn chưa hoàn tất hoặc của người khác bị chặn", async (t) => {
  const f = await fixture(t);
  const o = await f.buy();
  const review = {
    dish_id: "chicken-rice",
    rating: 5,
    comment: "Ngon",
  };
  await assert.rejects(
    async () => await f.order.review(f.customer, o.id, review),
    {
      status: 409,
    },
  );
  await assert.rejects(
    async () =>
      await f.order.review(
        {
          ...f.customer,
          id: "other",
        },
        o.id,
        review,
      ),
    {
      status: 403,
    },
  );
  const c = await f.move(
    await f.move(await f.move(o, "preparing"), "ready"),
    "completed",
  );
  await f.order.review(f.customer, c.id, review);
  await assert.rejects(
    async () => await f.order.review(f.customer, c.id, review),
    {
      status: 409,
    },
  );
});
test("TC17 — recipe 150g gạo + 100g gà lưu chính xác", async (t) => {
  const f = await fixture(t);
  await f.recipe();
  const recipe = await f.db
    .prepare(
      "SELECT ingredient_id,quantity FROM recipes WHERE dish_id=? ORDER BY ingredient_id",
    )
    .all("chicken-rice");
  assert.deepEqual(
    recipe.map((r) => [r.ingredient_id, r.quantity]),
    [
      ["chicken", 100000],
      ["rice", 150000],
    ],
  );
});
test("TC18 — kho 250g, cần 300g: báo thiếu 50g và rollback toàn bộ", async (t) => {
  const f = await fixture(t);
  await f.recipe();
  await f.setStock("rice", 250);
  const chicken = await f.stock("chicken");
  const o = await f.buy("chicken-rice", 2);
  await assert.rejects(
    async () => await f.move(o, "preparing"),
    /Thiếu 50 g Gạo/,
  );
  assert.equal(await f.stock("rice"), 250);
  assert.equal(await f.stock("chicken"), chicken);
  assert.equal((await f.order.detail(f.customer, o.id)).status, "pending");
});
test("TC19 — 2 suất trừ 300g gạo và 200g gà", async (t) => {
  const f = await fixture(t);
  await f.recipe();
  await f.setStock("rice", 500);
  await f.setStock("chicken", 400);
  await f.move(await f.buy("chicken-rice", 2), "preparing");
  assert.equal(await f.stock("rice"), 200);
  assert.equal(await f.stock("chicken"), 200);
});
test("TC20 — hủy sau chế biến hoàn đúng snapshot dù đã sửa recipe", async (t) => {
  const f = await fixture(t);
  await f.recipe();
  await f.setStock("rice", 500);
  await f.setStock("chicken", 400);
  const p = await f.move(await f.buy("chicken-rice", 2), "preparing");
  await f.recipe(10, 20);
  await f.move(p, "cancelled");
  assert.equal(await f.stock("rice"), 500);
  assert.equal(await f.stock("chicken"), 400);
  assert.equal(await f.balance(), 200000);
  await assert.rejects(async () => await f.move(p, "cancelled"), {
    status: 409,
  });
  assert.equal(await f.stock("rice"), 500);
});
async function race(path, commands) {
  const gate = new SharedArrayBuffer(4);
  const workers = commands.map(
    (command) =>
      new Worker(new URL("./race-worker.js", import.meta.url), {
        workerData: {
          path,
          command,
          gate,
        },
      }),
  );
  await Promise.all(
    workers.map(
      (worker) =>
        new Promise((resolve, reject) => {
          worker.once("message", resolve);
          worker.once("error", reject);
        }),
    ),
  );
  const results = workers.map(
    (worker) =>
      new Promise((resolve, reject) => {
        worker.once("message", resolve);
        worker.once("error", reject);
      }),
  );
  Atomics.store(new Int32Array(gate), 0, 1);
  Atomics.notify(new Int32Array(gate), 0);
  const exits = workers.map(
    (worker) => new Promise((resolve) => worker.once("exit", resolve)),
  );
  const values = await Promise.all(results);
  await Promise.all(exits);
  return values;
}
test("TC21 — hai worker/kết nối DB tranh 300g gạo, mỗi đơn cần 200g", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "canteengo-race-"));
  const path = join(dir, "test.sqlite");
  const f = await fixture(t, path);
  t.after(() => {
    assert.ok(dir.startsWith(join(tmpdir(), "canteengo-race-")));
    rmSync(dir, {
      recursive: true,
      force: true,
    });
  });
  await f.recipe(200, 100);
  await f.setStock("rice", 300);
  const a = await f.buy(),
    b = await f.buy();
  const results = await race(
    path,
    [a, b].map((o) => ({
      action: "prepare",
      id: o.id,
    })),
  );
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 1);
  assert.equal(await f.stock("rice"), 100);
  assert.deepEqual(
    (await f.db.prepare("SELECT status FROM orders ORDER BY status").all()).map(
      (o) => o.status,
    ),
    ["pending", "preparing"],
  );
});
test("EX01 — hai kết nối tranh chỗ cuối của slot", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "canteengo-slot-"));
  const path = join(dir, "test.sqlite");
  const f = await fixture(t, path);
  t.after(() => {
    assert.ok(dir.startsWith(join(tmpdir(), "canteengo-slot-")));
    rmSync(dir, {
      recursive: true,
      force: true,
    });
  });
  await f.db.prepare("UPDATE slots SET capacity=1 WHERE id=?").run(f.slot.id);
  const results = await race(
    path,
    await Promise.all(
      [1, 2].map(async () => ({
        action: "checkout",
        data: await f.request(),
      })),
    ),
  );
  assert.equal(results.filter((r) => r.ok).length, 1);
  assert.equal(
    (await f.db.prepare("SELECT COUNT(*) n FROM orders").get()).n,
    1,
  );
  assert.equal(await f.balance(), 165000);
});
test("EX02 — nhiều món dùng chung nguyên liệu được cộng gộp", async (t) => {
  const f = await fixture(t);
  await f.recipe(150, 100);
  const data = await f.request();
  data.items.push({
    dish_id: "beef-rice",
    quantity: 2,
    price: 45000,
    note: "",
  });
  const before = await f.stock("rice");
  await f.move(await f.order.checkout(f.customer, data), "preparing");
  assert.equal(await f.stock("rice"), before - 450);
});
test("EX03 — recipe trùng, sai đơn vị, 0/âm không làm mất recipe cũ", async (t) => {
  const f = await fixture(t);
  await f.recipe();
  for (const lines of [
    [
      {
        ingredient_id: "rice",
        unit: "g",
        quantity: 0,
      },
    ],
    [
      {
        ingredient_id: "rice",
        unit: "ml",
        quantity: 5,
      },
    ],
    [
      {
        ingredient_id: "rice",
        unit: "g",
        quantity: 5,
      },
      {
        ingredient_id: "rice",
        unit: "g",
        quantity: 5,
      },
    ],
    [],
  ])
    await assert.rejects(
      async () =>
        await f.inventory.saveRecipe(f.admin, "chicken-rice", {
          lines,
        }),
      {
        status: 400,
      },
    );
  assert.equal(
    (
      await f.db
        .prepare("SELECT COUNT(*) n FROM recipes WHERE dish_id='chicken-rice'")
        .get()
    ).n,
    2,
  );
});
test("EX04 — chặn giá cũ và ngày không bán; giữ snapshot giá", async (t) => {
  const f = await fixture(t);
  const body = await f.request();
  const original = await f.order.checkout(f.customer, body);
  await f.db
    .prepare("UPDATE dishes SET price=39000 WHERE id='chicken-rice'")
    .run();
  await assert.rejects(
    async () =>
      await f.order.checkout(f.customer, {
        ...body,
        reference: randomUUID(),
      }),
    {
      status: 409,
    },
  );
  assert.equal(
    (await f.order.detail(f.customer, original.id)).items[0].price,
    35000,
  );
  await f.db
    .prepare("UPDATE dishes SET weekdays='[]' WHERE id='chicken-rice'")
    .run();
  await assert.rejects(async () => await f.buy(), {
    status: 409,
  });
});
test("EX05 — phân quyền và quyền sở hữu được kiểm tra ở máy chủ", async (t) => {
  const f = await fixture(t);
  const o = await f.buy();
  await assert.rejects(async () => await f.move(o, "preparing", f.customer), {
    status: 403,
  });
  await assert.rejects(
    async () =>
      await f.order.detail(
        {
          ...f.customer,
          id: "other",
        },
        o.id,
      ),
    {
      status: 403,
    },
  );
  await assert.rejects(
    async () =>
      await f.inventory.saveRecipe(f.staff, "chicken-rice", {
        lines: [],
      }),
    {
      status: 403,
    },
  );
  await assert.rejects(
    async () => await f.report.summary(f.staff, localDate(), localDate()),
    {
      status: 403,
    },
  );
  await assert.rejects(
    async () =>
      await updateAccount(f.db, f.admin, f.admin.id, {
        role: "customer",
        active: false,
      }),
    {
      status: 400,
    },
  );
});
test("EX06 — nạp ví và nhập kho chống lặp, không xuất âm", async (t) => {
  const f = await fixture(t);
  const topup = {
    amount: 100000,
    reference: randomUUID(),
  };
  await f.payment.topup(f.customer, topup);
  await f.payment.topup(f.customer, topup);
  assert.equal(await f.balance(), 300000);
  const adjustment = {
    ingredient_id: "rice",
    type: "in",
    quantity: 10.125,
    reason: "Phiếu nhập thử",
    reference: randomUUID(),
  };
  const before = await f.stock("rice");
  await f.inventory.adjust(f.staff, adjustment);
  await f.inventory.adjust(f.staff, adjustment);
  assert.equal(await f.stock("rice"), before + 10.125);
  await assert.rejects(
    async () =>
      await f.inventory.adjust(f.staff, {
        ...adjustment,
        reference: randomUUID(),
        type: "out",
        quantity: 999999,
      }),
    {
      status: 409,
    },
  );
});
test("EX07 — đăng ký trường/khách, băm mật khẩu và chặn trùng", async (t) => {
  const f = await fixture(t);
  const config = {
    schoolDomain: "school.edu.vn",
  };
  const u = await register(
    f.db,
    {
      name: "Khách thử",
      phone: "0987654321",
      password: "Testing@123",
      kind: "external",
      role: "admin",
    },
    config,
  );
  assert.equal(u.role, "customer");
  assert.notEqual(u.password_hash, "Testing@123");
  assert.equal(u.balance, 0);
  await assert.rejects(
    register(
      f.db,
      {
        name: "Trường thử",
        email: "test@gmail.com",
        password: "Testing@123",
        kind: "school",
      },
      config,
    ),
    {
      status: 400,
    },
  );
  await assert.rejects(
    register(
      f.db,
      {
        name: "Khách thử",
        phone: "0987654321",
        password: "Testing@123",
      },
      config,
    ),
    {
      status: 409,
    },
  );
});
test("EX08 — thiếu Recipe chặn nhận đơn; xóa món giữ lịch sử", async (t) => {
  const f = await fixture(t);
  const o = await f.buy();
  await f.db.prepare("DELETE FROM recipes WHERE dish_id='chicken-rice'").run();
  await assert.rejects(async () => await f.move(o, "preparing"), {
    status: 409,
  });
  await f.menu.remove(f.admin, "chicken-rice");
  assert.equal(
    (await f.order.detail(f.customer, o.id)).items[0].name,
    "Cơm gà xé",
  );
  await assert.rejects(async () => await f.buy(), {
    status: 409,
  });
});
