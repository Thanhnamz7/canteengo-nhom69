import { randomUUID, createHash } from "node:crypto";
import { transaction, localDate, ensureSlots } from "./db.js";
import { fail, requireRole, publicUser } from "./auth.js";
const now = () => new Date().toISOString();
const money = (v) => Number.isSafeInteger(v) && v > 0 && v <= 100000000;
const text = (v, max = 500) => {
  fail(
    typeof v === "string" && v.trim().length <= max,
    `Nội dung vượt quá ${max} ký tự hoặc sai định dạng.`,
  );
  return v.trim();
};
const requiredText = (v, max = 100) => {
  const value = text(v, max);
  fail(value.length > 0, "Vui lòng điền đầy đủ trường bắt buộc.");
  return value;
};
const quantity = (v, allowZero = false) => {
  fail(
    typeof v === "number" &&
      Number.isFinite(v) &&
      (allowZero ? v >= 0 : v > 0) &&
      v <= 100000000 &&
      Math.abs(v * 1000 - Math.round(v * 1000)) < 0.00001,
    "Số lượng phải hợp lệ, tối đa 3 chữ số thập phân.",
  );
  return Math.round(v * 1000);
};
const ref = (v) => {
  fail(
    typeof v === "string" && /^[a-zA-Z0-9_-]{8,100}$/.test(v),
    "Mã tham chiếu giao dịch không hợp lệ.",
  );
  return v;
};
const audit = async (db, user, action, entity, detail) =>
  await db
    .prepare(
      "INSERT INTO audit_log(actor_id,action,entity_id,detail,created_at) VALUES(?,?,?,?,?)",
    )
    .run(user.id, action, entity, JSON.stringify(detail), now());
const movement = async (
  db,
  ingredientId,
  amount,
  type,
  orderId,
  actorId,
  reason,
  reference,
) =>
  await db
    .prepare("INSERT INTO stock_movements VALUES(?,?,?,?,?,?,?,?,?)")
    .run(
      randomUUID(),
      ingredientId,
      amount,
      type,
      orderId,
      actorId,
      reason,
      reference,
      now(),
    );
const weekday = (date) => new Date(date + "T12:00:00+07:00").getUTCDay();
export class MenuService {
  constructor(db) {
    this.db = db;
  }
  async list(date = localDate(), admin = false) {
    fail(
      /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)),
      "Ngày không hợp lệ.",
    );
    return await Promise.all(
      (
        await this.db
          .prepare(
            `SELECT d.*, (SELECT ROUND(AVG(rating),1) FROM reviews WHERE dish_id=d.id) rating,
      (SELECT COUNT(*) FROM reviews WHERE dish_id=d.id) review_count FROM dishes d WHERE deleted=0 ORDER BY rowid`,
          )
          .all()
      ).map(async (d) => ({
        ...d,
        weekdays: JSON.parse(d.weekdays),
        serving: Boolean(
          d.available && JSON.parse(d.weekdays).includes(weekday(date)),
        ),
        ...(admin
          ? {
              recipe: await this.db
                .prepare(
                  "SELECT r.ingredient_id, i.name, i.unit, r.quantity/1000.0 quantity FROM recipes r JOIN ingredients i ON i.id=r.ingredient_id WHERE r.dish_id=?",
                )
                .all(d.id),
            }
          : {}),
      })),
    );
  }
  async save(user, id, data) {
    requireRole(user, "admin");
    const name = requiredText(data.name),
      category = requiredText(data.category, 60);
    fail(money(data.price), "Giá phải là số nguyên VND dương.");
    const description = text(data.description || "", 1000),
      components = text(data.components || "", 500);
    const image = text(data.image || "", 1000);
    fail(
      !image ||
        /^\/assets\/[a-zA-Z0-9_.-]+$/.test(image) ||
        /^https:\/\/[^\s]+$/.test(image),
      "Ảnh phải là đường dẫn /assets/ hoặc URL HTTPS.",
    );
    fail(
      Array.isArray(data.weekdays) &&
        data.weekdays.length > 0 &&
        data.weekdays.every((d) => Number.isInteger(d) && d >= 0 && d <= 6) &&
        new Set(data.weekdays).size === data.weekdays.length,
      "Chọn ít nhất một ngày bán, không trùng.",
    );
    fail(typeof data.available === "boolean", "Trạng thái món không hợp lệ.");
    return await transaction(this.db, async () => {
      if (id)
        fail(
          await this.db
            .prepare("SELECT id FROM dishes WHERE id=? AND deleted=0")
            .get(id),
          "Không tìm thấy món.",
          404,
        );
      else id = randomUUID();
      await this.db
        .prepare(
          `INSERT INTO dishes(id,name,category,price,description,components,image,available,weekdays) VALUES(?,?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name,category=excluded.category,price=excluded.price,description=excluded.description,components=excluded.components,image=excluded.image,available=excluded.available,weekdays=excluded.weekdays`,
        )
        .run(
          id,
          name,
          category,
          data.price,
          description,
          components,
          image,
          Number(data.available),
          JSON.stringify(data.weekdays),
        );
      await audit(this.db, user, "dish.save", id, data);
      return {
        id,
      };
    });
  }
  async remove(user, id) {
    requireRole(user, "admin");
    return await transaction(this.db, async () => {
      fail(
        (
          await this.db
            .prepare(
              "UPDATE dishes SET deleted=1,available=0 WHERE id=? AND deleted=0",
            )
            .run(id)
        ).changes,
        "Không tìm thấy món.",
        404,
      );
      await audit(this.db, user, "dish.delete", id, {});
      return {
        ok: true,
      };
    });
  }
}
export class InventoryService {
  constructor(db) {
    this.db = db;
  }
  async list(user) {
    requireRole(user, "staff", "admin");
    return (
      await this.db
        .prepare(
          "SELECT i.*, s.name supplier_name FROM ingredients i LEFT JOIN suppliers s ON s.id=i.supplier_id ORDER BY i.name",
        )
        .all()
    ).map((i) => ({
      ...i,
      stock: i.stock / 1000,
      minimum: i.minimum / 1000,
      low: i.stock <= i.minimum,
    }));
  }
  async saveIngredient(user, id, data) {
    requireRole(user, "admin");
    const name = requiredText(data.name),
      minimum = quantity(data.minimum, true);
    fail(["g", "ml", "cái"].includes(data.unit), "Đơn vị không hợp lệ.");
    return await transaction(this.db, async () => {
      if (data.supplier_id)
        fail(
          await this.db
            .prepare("SELECT id FROM suppliers WHERE id=?")
            .get(data.supplier_id),
          "Nhà cung cấp không tồn tại.",
        );
      if (id) {
        const old = await this.db
          .prepare("SELECT * FROM ingredients WHERE id=?")
          .get(id);
        fail(old, "Không tìm thấy nguyên liệu.", 404);
        fail(
          old.unit === data.unit,
          "Không đổi đơn vị sau khi tạo nguyên liệu để bảo toàn lịch sử kho.",
        );
        await this.db
          .prepare(
            "UPDATE ingredients SET name=?,minimum=?,supplier_id=? WHERE id=?",
          )
          .run(name, minimum, data.supplier_id || null, id);
      } else {
        id = randomUUID();
        await this.db
          .prepare("INSERT INTO ingredients VALUES(?,?,?,?,?,?)")
          .run(id, name, data.unit, 0, minimum, data.supplier_id || null);
      }
      await audit(this.db, user, "ingredient.save", id, data);
      return {
        id,
      };
    });
  }
  async saveSupplier(user, id, data) {
    requireRole(user, "admin");
    const name = requiredText(data.name),
      phone = text(data.phone || "", 30),
      address = text(data.address || "", 300);
    return await transaction(this.db, async () => {
      if (id)
        fail(
          await this.db.prepare("SELECT id FROM suppliers WHERE id=?").get(id),
          "Không tìm thấy nhà cung cấp.",
          404,
        );
      else id = randomUUID();
      await this.db
        .prepare(
          "INSERT INTO suppliers VALUES(?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,phone=excluded.phone,address=excluded.address",
        )
        .run(id, name, phone, address);
      await audit(this.db, user, "supplier.save", id, data);
      return {
        id,
      };
    });
  }
  async saveRecipe(user, dishId, data) {
    requireRole(user, "admin");
    fail(
      Array.isArray(data.lines) &&
        data.lines.length > 0 &&
        data.lines.length <= 100,
      "Recipe cần có 1–100 nguyên liệu.",
    );
    fail(
      new Set(data.lines.map((l) => l.ingredient_id)).size ===
        data.lines.length,
      "Nguyên liệu bị trùng.",
    );
    const lines = data.lines.map((l) => ({
      ...l,
      quantity: quantity(l.quantity),
    }));
    return await transaction(this.db, async () => {
      fail(
        await this.db
          .prepare("SELECT id FROM dishes WHERE id=? AND deleted=0")
          .get(dishId),
        "Món không tồn tại.",
        404,
      );
      for (const line of lines) {
        const ingredient = await this.db
          .prepare("SELECT * FROM ingredients WHERE id=?")
          .get(line.ingredient_id);
        fail(ingredient, "Nguyên liệu không tồn tại.");
        fail(
          line.unit === ingredient.unit,
          `Đơn vị của ${ingredient.name} phải là ${ingredient.unit}.`,
        );
      }
      await this.db.prepare("DELETE FROM recipes WHERE dish_id=?").run(dishId);
      for (const line of lines)
        await this.db
          .prepare("INSERT INTO recipes VALUES(?,?,?)")
          .run(dishId, line.ingredient_id, line.quantity);
      await audit(this.db, user, "recipe.save", dishId, data.lines);
      return {
        ok: true,
      };
    });
  }
  async adjust(user, data) {
    requireRole(user, "staff", "admin");
    const amount = quantity(data.quantity),
      reason = requiredText(data.reason, 300),
      reference = `manual:${user.id}:${ref(data.reference)}`;
    fail(["in", "out"].includes(data.type), "Chọn nhập kho hoặc xuất kho.");
    return await transaction(this.db, async () => {
      const old = await this.db
        .prepare("SELECT * FROM stock_movements WHERE reference=?")
        .get(reference);
      const delta = data.type === "in" ? amount : -amount;
      if (old) {
        fail(
          old.ingredient_id === data.ingredient_id &&
            old.quantity === delta &&
            old.reason === reason,
          "Mã giao dịch đã dùng cho nội dung khác.",
          409,
        );
        return {
          ok: true,
          replay: true,
        };
      }
      const ingredient = await this.db
        .prepare("SELECT * FROM ingredients WHERE id=?")
        .get(data.ingredient_id);
      fail(ingredient, "Không tìm thấy nguyên liệu.", 404);
      fail(
        ingredient.stock + delta >= 0,
        "Số lượng xuất vượt quá tồn kho.",
        409,
      );
      fail(
        Number.isSafeInteger(ingredient.stock + delta),
        "Tồn kho vượt giới hạn.",
      );
      await this.db
        .prepare("UPDATE ingredients SET stock=stock+? WHERE id=?")
        .run(delta, ingredient.id);
      await movement(
        this.db,
        ingredient.id,
        delta,
        data.type,
        null,
        user.id,
        reason,
        reference,
      );
      return {
        ok: true,
      };
    });
  }
  async history(user) {
    requireRole(user, "staff", "admin");
    return (
      await this.db
        .prepare(
          `SELECT m.*,i.name,i.unit,u.name actor_name FROM stock_movements m JOIN ingredients i ON i.id=m.ingredient_id JOIN users u ON u.id=m.actor_id ORDER BY m.created_at DESC,m.rowid DESC LIMIT 300`,
        )
        .all()
    ).map((m) => ({
      ...m,
      quantity: m.quantity / 1000,
    }));
  }
}
export class OrderService {
  constructor(db) {
    this.db = db;
  }
  async slots() {
    await ensureSlots(this.db);
    return (
      await this.db
        .prepare(
          `SELECT s.*, (SELECT COUNT(*) FROM orders o WHERE o.slot_id=s.id AND o.status<>'cancelled') used FROM slots s WHERE julianday(starts_at)>julianday(?) ORDER BY starts_at`,
        )
        .all(now())
    ).map((s) => ({
      ...s,
      remaining: s.capacity - s.used,
    }));
  }
  async detail(user, id) {
    requireRole(user);
    const order = await this.db
      .prepare(
        `SELECT o.*,u.name customer_name,u.phone,u.allergies,s.starts_at,s.ends_at FROM orders o JOIN users u ON u.id=o.user_id JOIN slots s ON s.id=o.slot_id WHERE o.id=?`,
      )
      .get(id);
    fail(order, "Không tìm thấy đơn.", 404);
    fail(
      user.role !== "customer" || order.user_id === user.id,
      "Đơn hàng không thuộc tài khoản của bạn.",
      403,
    );
    return {
      ...order,
      items: await this.db
        .prepare("SELECT * FROM order_items WHERE order_id=?")
        .all(id),
      history: await this.db
        .prepare(
          "SELECT h.*,u.name actor_name FROM order_history h JOIN users u ON u.id=h.actor_id WHERE h.order_id=? ORDER BY h.id",
        )
        .all(id),
      reviews: await this.db
        .prepare("SELECT * FROM reviews WHERE order_id=?")
        .all(id),
    };
  }
  async list(user) {
    requireRole(user);
    const ids =
      user.role === "customer"
        ? await this.db
            .prepare(
              "SELECT id FROM orders WHERE user_id=? ORDER BY created_at DESC LIMIT 300",
            )
            .all(user.id)
        : await this.db
            .prepare("SELECT id FROM orders ORDER BY created_at DESC LIMIT 500")
            .all();
    return await Promise.all(
      ids.map(async (o) => await this.detail(user, o.id)),
    );
  }
  async checkout(user, data) {
    requireRole(user, "customer");
    ref(data.reference);
    fail(
      Array.isArray(data.items) &&
        data.items.length > 0 &&
        data.items.length <= 50,
      "Giỏ hàng cần có 1–50 dòng món.",
    );
    const items = data.items.map((i) => {
      fail(
        typeof i.dish_id === "string" &&
          Number.isInteger(i.quantity) &&
          i.quantity >= 1 &&
          i.quantity <= 99,
        "Số lượng món phải là số nguyên từ 1 đến 99.",
      );
      fail(money(i.price), "Giá món không hợp lệ.");
      return {
        dish_id: i.dish_id,
        quantity: i.quantity,
        price: i.price,
        note: text(i.note || "", 300),
      };
    });
    fail(typeof data.slot_id === "string", "Chọn khung giờ nhận món.");
    const fingerprint = createHash("sha256")
      .update(
        JSON.stringify({
          items,
          slot_id: data.slot_id,
        }),
      )
      .digest("hex");
    return await transaction(this.db, async () => {
      const old = await this.db
        .prepare("SELECT * FROM orders WHERE user_id=? AND reference=?")
        .get(user.id, data.reference);
      if (old) {
        fail(
          old.fingerprint === fingerprint,
          "Mã thanh toán đã dùng cho giỏ hàng khác.",
          409,
        );
        return await this.detail(user, old.id);
      }
      const slot = await this.db
        .prepare("SELECT * FROM slots WHERE id=?")
        .get(data.slot_id);
      fail(
        slot && Date.parse(slot.starts_at) > Date.now(),
        "Khung giờ đã qua hoặc không tồn tại.",
        409,
      );
      const used = (
        await this.db
          .prepare(
            "SELECT COUNT(*) n FROM orders WHERE slot_id=? AND status<>'cancelled'",
          )
          .get(slot.id)
      ).n;
      fail(
        used < slot.capacity,
        "Khung giờ đã đầy. Vui lòng chọn giờ khác.",
        409,
      );
      let total = 0;
      const resolved = await Promise.all(
        items.map(async (i) => {
          const dish = await this.db
            .prepare("SELECT * FROM dishes WHERE id=?")
            .get(i.dish_id);
          fail(
            dish &&
              !dish.deleted &&
              dish.available &&
              JSON.parse(dish.weekdays).includes(
                weekday(slot.starts_at.slice(0, 10)),
              ),
            `Món ${dish?.name || ""} đã hết hoặc không bán trong ngày nhận.`,
            409,
          );
          fail(
            dish.price === i.price,
            `Giá ${dish.name} đã thay đổi. Cập nhật giỏ và xác nhận lại.`,
            409,
          );
          total += dish.price * i.quantity;
          return {
            ...i,
            name: dish.name,
          };
        }),
      );
      fail(Number.isSafeInteger(total), "Tổng tiền vượt giới hạn.");
      const freshUser = await this.db
        .prepare("SELECT * FROM users WHERE id=?")
        .get(user.id);
      fail(
        freshUser.balance >= total,
        "Số dư ví không đủ. Vui lòng nạp ví giả lập.",
        409,
      );
      const id = randomUUID(),
        createdAt = now();
      await this.db
        .prepare(
          "INSERT INTO orders(id,user_id,slot_id,total,status,reference,fingerprint,created_at) VALUES(?,?,?,?,'pending',?,?,?)",
        )
        .run(
          id,
          user.id,
          slot.id,
          total,
          data.reference,
          fingerprint,
          createdAt,
        );
      for (const item of resolved)
        await this.db
          .prepare(
            "INSERT INTO order_items(order_id,dish_id,name,price,quantity,note) VALUES(?,?,?,?,?,?)",
          )
          .run(
            id,
            item.dish_id,
            item.name,
            item.price,
            item.quantity,
            item.note,
          );
      await this.db
        .prepare("UPDATE users SET balance=balance-? WHERE id=?")
        .run(total, user.id);
      await this.db
        .prepare("INSERT INTO payments VALUES(?,?,?,?,?,?,?)")
        .run(
          randomUUID(),
          user.id,
          id,
          "payment",
          total,
          `pay:${id}`,
          createdAt,
        );
      await this.db
        .prepare(
          "INSERT INTO order_history(order_id,status,actor_id,created_at) VALUES(?,?,?,?)",
        )
        .run(id, "pending", user.id, createdAt);
      return await this.detail(user, id);
    });
  }
  async transition(user, id, data) {
    requireRole(user);
    fail(
      ["preparing", "ready", "completed", "cancelled"].includes(data.status),
      "Trạng thái đích không hợp lệ.",
    );
    return await transaction(this.db, async () => {
      const order = await this.detail(user, id);
      fail(
        order.status === data.expected_status,
        "Đơn đã được cập nhật. Vui lòng tải lại.",
        409,
      );
      if (user.role === "customer")
        fail(
          data.status === "cancelled" && order.status === "pending",
          "Bạn chỉ được hủy đơn của mình khi còn chờ xử lý.",
          403,
        );
      const next = {
        pending: ["preparing", "cancelled"],
        preparing: ["ready", "cancelled"],
        ready: ["completed"],
        completed: [],
        cancelled: [],
      };
      fail(
        next[order.status].includes(data.status),
        "Không thể chuyển trạng thái theo thứ tự này.",
        409,
      );
      const reason =
        data.status === "cancelled" ? requiredText(data.reason, 300) : "";
      if (data.status === "preparing") {
        const requirements = new Map();
        for (const item of order.items) {
          const recipe = await this.db
            .prepare("SELECT * FROM recipes WHERE dish_id=?")
            .all(item.dish_id);
          fail(
            recipe.length,
            `Món ${item.name} chưa có định lượng nguyên liệu.`,
            409,
          );
          for (const line of recipe)
            requirements.set(
              line.ingredient_id,
              (requirements.get(line.ingredient_id) || 0) +
                line.quantity * item.quantity,
            );
        }
        for (const [ingredientId, amount] of requirements) {
          const ingredient = await this.db
            .prepare("SELECT * FROM ingredients WHERE id=?")
            .get(ingredientId);
          fail(
            Number.isSafeInteger(amount) && ingredient.stock >= amount,
            `Thiếu ${Math.max(0, amount - ingredient.stock) / 1000} ${ingredient.unit} ${ingredient.name}. Đơn vẫn chờ xử lý.`,
            409,
          );
        }
        for (const [ingredientId, amount] of requirements) {
          await this.db
            .prepare("UPDATE ingredients SET stock=stock-? WHERE id=?")
            .run(amount, ingredientId);
          await movement(
            this.db,
            ingredientId,
            -amount,
            "consume",
            id,
            user.id,
            "Xác nhận chế biến",
            `consume:${id}:${ingredientId}`,
          );
        }
      }
      if (data.status === "cancelled") {
        await this.db
          .prepare("UPDATE users SET balance=balance+? WHERE id=?")
          .run(order.total, order.user_id);
        await this.db
          .prepare("INSERT INTO payments VALUES(?,?,?,?,?,?,?)")
          .run(
            randomUUID(),
            order.user_id,
            id,
            "refund",
            order.total,
            `refund:${id}`,
            now(),
          );
        // Restore from immutable consumption entries, NEVER from the current recipe.
        const consumed = await this.db
          .prepare(
            "SELECT * FROM stock_movements WHERE order_id=? AND type='consume'",
          )
          .all(id);
        for (const entry of consumed) {
          await this.db
            .prepare("UPDATE ingredients SET stock=stock-? WHERE id=?")
            .run(entry.quantity, entry.ingredient_id);
          await movement(
            this.db,
            entry.ingredient_id,
            -entry.quantity,
            "restore",
            id,
            user.id,
            `Hoàn kho giả lập: ${reason}`,
            `restore:${id}:${entry.ingredient_id}`,
          );
        }
      }
      await this.db
        .prepare("UPDATE orders SET status=?, completed_at=? WHERE id=?")
        .run(data.status, data.status === "completed" ? now() : null, id);
      await this.db
        .prepare(
          "INSERT INTO order_history(order_id,status,actor_id,reason,created_at) VALUES(?,?,?,?,?)",
        )
        .run(id, data.status, user.id, reason, now());
      return await this.detail(user, id);
    });
  }
  async review(user, id, data) {
    requireRole(user, "customer");
    fail(
      Number.isInteger(data.rating) && data.rating >= 1 && data.rating <= 5,
      "Số sao từ 1 đến 5.",
    );
    const comment = text(data.comment || "", 1000);
    return await transaction(this.db, async () => {
      const order = await this.detail(user, id);
      fail(order.status === "completed", "Chỉ đánh giá đơn đã hoàn tất.", 409);
      fail(
        order.items.some((i) => i.dish_id === data.dish_id),
        "Món không có trong đơn.",
      );
      fail(
        !(await this.db
          .prepare("SELECT id FROM reviews WHERE order_id=? AND dish_id=?")
          .get(id, data.dish_id)),
        "Bạn đã đánh giá món này trong đơn.",
        409,
      );
      await this.db
        .prepare("INSERT INTO reviews VALUES(?,?,?,?,?,?,?)")
        .run(
          randomUUID(),
          id,
          data.dish_id,
          user.id,
          data.rating,
          comment,
          now(),
        );
      return {
        ok: true,
      };
    });
  }
}
export class PaymentService {
  constructor(db, demoMode) {
    this.db = db;
    this.demoMode = demoMode;
  }
  async topup(user, data) {
    requireRole(user, "customer");
    fail(this.demoMode, "Nạp thử chỉ bật trong chế độ demo.", 403);
    fail(
      Number.isInteger(data.amount) &&
        data.amount >= 10000 &&
        data.amount <= 1000000,
      "Nạp thử từ 10.000đ đến 1.000.000đ.",
    );
    const reference = `topup:${user.id}:${ref(data.reference)}`;
    return await transaction(this.db, async () => {
      const old = await this.db
        .prepare("SELECT * FROM payments WHERE reference=?")
        .get(reference);
      if (old) {
        fail(
          old.amount === data.amount,
          "Mã giao dịch đã dùng với số tiền khác.",
          409,
        );
        return {
          ok: true,
          replay: true,
        };
      }
      const fresh = await this.db
        .prepare("SELECT balance FROM users WHERE id=?")
        .get(user.id);
      fail(
        fresh.balance + data.amount <= 100000000,
        "Ví demo tối đa 100.000.000đ.",
      );
      await this.db
        .prepare("UPDATE users SET balance=balance+? WHERE id=?")
        .run(data.amount, user.id);
      await this.db
        .prepare("INSERT INTO payments VALUES(?,?,NULL,?,?,?,?)")
        .run(randomUUID(), user.id, "topup", data.amount, reference, now());
      return {
        ok: true,
      };
    });
  }
  async history(user) {
    requireRole(user);
    return await this.db
      .prepare(
        "SELECT * FROM payments WHERE user_id=? ORDER BY created_at DESC,rowid DESC LIMIT 300",
      )
      .all(user.id);
  }
}
export class ReportService {
  constructor(db) {
    this.db = db;
  }
  async summary(user, from, to) {
    requireRole(user, "admin");
    fail(
      /^\d{4}-\d{2}-\d{2}$/.test(from || "") &&
        /^\d{4}-\d{2}-\d{2}$/.test(to || "") &&
        Number.isFinite(Date.parse(from)) &&
        Number.isFinite(Date.parse(to)) &&
        from <= to,
      "Khoảng ngày không hợp lệ.",
    );
    const condition =
      "status='completed' AND date(completed_at,'+7 hours') BETWEEN ? AND ?";
    const summary = await this.db
      .prepare(
        `SELECT COUNT(*) completed,COALESCE(SUM(total),0) revenue FROM orders WHERE ${condition}`,
      )
      .get(from, to);
    const daily = await this.db
      .prepare(
        `SELECT date(completed_at,'+7 hours') date,COUNT(*) orders,SUM(total) revenue FROM orders WHERE ${condition} GROUP BY date ORDER BY date`,
      )
      .all(from, to);
    const dishes = await this.db
      .prepare(
        `SELECT d.id,d.name,COALESCE(SUM(CASE WHEN o.${condition} THEN i.quantity ELSE 0 END),0) quantity,COALESCE(SUM(CASE WHEN o.${condition} THEN i.quantity*i.price ELSE 0 END),0) revenue FROM dishes d LEFT JOIN order_items i ON i.dish_id=d.id LEFT JOIN orders o ON o.id=i.order_id GROUP BY d.id ORDER BY quantity DESC,d.name`,
      )
      .all(from, to, from, to);
    const inventory = await this.db
      .prepare(
        `SELECT i.id,i.name,i.unit,i.stock/1000.0 stock,i.minimum/1000.0 minimum,
      COALESCE(SUM(CASE WHEN date(m.created_at,'+7 hours') BETWEEN ? AND ? AND m.type='consume' THEN -m.quantity ELSE 0 END),0)/1000.0 consumed,
      COALESCE(SUM(CASE WHEN date(m.created_at,'+7 hours') BETWEEN ? AND ? AND m.type='restore' THEN m.quantity ELSE 0 END),0)/1000.0 restored,
      COALESCE(SUM(CASE WHEN date(m.created_at,'+7 hours') BETWEEN ? AND ? AND m.type='out' THEN -m.quantity ELSE 0 END),0)/1000.0 manual_out,
      (i.stock-COALESCE(SUM(m.quantity),0))/1000.0 discrepancy
      FROM ingredients i LEFT JOIN stock_movements m ON m.ingredient_id=i.id GROUP BY i.id ORDER BY i.name`,
      )
      .all(from, to, from, to, from, to);
    return {
      from,
      to,
      ...summary,
      daily,
      dishes,
      inventory,
    };
  }
}
export async function updateProfile(db, user, data) {
  requireRole(user);
  const name = requiredText(data.name),
    phone = text(data.phone || "", 20) || null,
    allergies = text(data.allergies || "", 500);
  fail(
    !phone || /^(0\d{9}|\+84\d{9})$/.test(phone),
    "Số điện thoại không hợp lệ.",
  );
  fail(
    user.email || phone,
    "Tài khoản cần giữ ít nhất email hoặc số điện thoại đăng nhập.",
  );
  return await transaction(db, async () => {
    fail(
      !phone ||
        !(await db
          .prepare("SELECT id FROM users WHERE phone=? AND id<>?")
          .get(phone, user.id)),
      "Số điện thoại đã được sử dụng.",
      409,
    );
    await db
      .prepare("UPDATE users SET name=?,phone=?,allergies=? WHERE id=?")
      .run(name, phone, allergies, user.id);
    return publicUser(
      await db.prepare("SELECT * FROM users WHERE id=?").get(user.id),
    );
  });
}
export async function updateAccount(db, user, id, data) {
  requireRole(user, "admin");
  fail(
    ["customer", "staff", "admin"].includes(data.role) &&
      typeof data.active === "boolean",
    "Vai trò/trạng thái không hợp lệ.",
  );
  fail(
    id !== user.id,
    "Không thể tự thay đổi quyền hoặc khóa tài khoản đang dùng.",
  );
  return await transaction(db, async () => {
    const target = await db.prepare("SELECT * FROM users WHERE id=?").get(id);
    fail(target, "Tài khoản không tồn tại.", 404);
    fail(
      target.role !== "customer" ||
        data.role === "customer" ||
        !(await db
          .prepare(
            "SELECT id FROM orders WHERE user_id=? AND status IN ('pending','preparing','ready')",
          )
          .get(id)),
      "Khách hàng còn đơn đang xử lý, chưa thể chuyển vai trò.",
    );
    await db
      .prepare("UPDATE users SET role=?,active=? WHERE id=?")
      .run(data.role, Number(data.active), id);
    await db.prepare("DELETE FROM sessions WHERE user_id=?").run(id);
    await audit(db, user, "account.update", id, data);
    return {
      ok: true,
    };
  });
}
