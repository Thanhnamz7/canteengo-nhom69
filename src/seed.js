import { hashPassword } from "./auth.js";
import { transaction, ensureSlots } from "./db.js";
export async function seed(db, demoMode = true) {
  await ensureSlots(db);
  if (!demoMode || (await db.prepare("SELECT id FROM users LIMIT 1").get()))
    return;
  const password = await hashPassword("Canteen@123");
  await transaction(db, async () => {
    if (await db.prepare("SELECT id FROM users LIMIT 1").get()) return;
    const statements = [];
    const writer = {
      prepare: (sql) => ({
        run: (...args) => {
          statements.push({ sql, args });
        },
      }),
    };
    const users = [
      [
        "demo-customer",
        "Nguyễn Minh Anh",
        "student@school.edu.vn",
        "customer",
        "school",
      ],
      [
        "demo-staff",
        "Nhân viên nhà ăn",
        "staff@canteengo.vn",
        "staff",
        "external",
      ],
      [
        "demo-admin",
        "Quản trị CanteenGo",
        "admin@canteengo.vn",
        "admin",
        "external",
      ],
    ];
    for (const [id, name, email, role, kind] of users) {
      await writer
        .prepare(
          "INSERT INTO users(id,name,email,password_hash,role,kind,balance) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          id,
          name,
          email,
          password,
          role,
          kind,
          role === "customer" ? 200000 : 0,
        );
      if (role === "customer")
        await writer
          .prepare(
            "INSERT INTO payments VALUES('demo-opening-wallet',?,NULL,'topup',200000,'demo-opening-wallet',?)",
          )
          .run(id, new Date().toISOString());
    }
    await writer
      .prepare("INSERT INTO suppliers VALUES(?,?,?,?)")
      .run(
        "supplier-fresh",
        "Thực phẩm An Tâm (demo)",
        "0901234567",
        "Kho mẫu — Hà Nội",
      );
    const ingredients = [
      ["rice", "Gạo", "g", 12000, 2000],
      ["chicken", "Thịt gà", "g", 8000, 1500],
      ["beef", "Thịt bò", "g", 4000, 800],
      ["noodle", "Bánh phở", "g", 6000, 1000],
      ["bread", "Bánh mì", "cái", 60, 10],
      ["egg", "Trứng", "cái", 80, 15],
      ["vegetable", "Rau củ", "g", 6000, 1000],
      ["tea", "Trà đào pha sẵn", "ml", 10000, 2000],
      ["milk", "Sữa tươi", "ml", 1000, 1500],
    ];
    for (const [id, name, unit, stock, minimum] of ingredients) {
      await writer
        .prepare("INSERT INTO ingredients VALUES(?,?,?,?,?,?)")
        .run(id, name, unit, stock * 1000, minimum * 1000, "supplier-fresh");
      await writer
        .prepare(
          "INSERT INTO stock_movements VALUES(?,?,?,'opening',NULL,'demo-admin','Tồn đầu kỳ demo',?,?)",
        )
        .run(
          `opening-${id}`,
          id,
          stock * 1000,
          `opening-${id}`,
          new Date().toISOString(),
        );
    }
    const dishes = [
      [
        "chicken-rice",
        "Cơm gà xé",
        "Cơm",
        35000,
        "Cơm thơm, gà xé mềm, rau xanh và nước sốt gừng. Một bữa trưa vừa đủ năng lượng.",
        "Gạo, thịt gà, rau củ, gừng, nước mắm",
        "/assets/rice.jpg",
      ],
      [
        "beef-pho",
        "Phở bò",
        "Bún & phở",
        40000,
        "Nước dùng nóng, bánh phở mềm và thịt bò thái mỏng. Phục vụ kèm rau thơm.",
        "Bánh phở, thịt bò, rau thơm, nước dùng",
        "/assets/pho.jpg",
      ],
      [
        "egg-bread",
        "Bánh mì trứng",
        "Ăn nhẹ",
        20000,
        "Bánh mì giòn với trứng, rau tươi và sốt nhà làm. Gọn nhẹ cho ngày bận rộn.",
        "Bánh mì (lúa mì), trứng, rau củ, sốt",
        "/assets/bread.png",
      ],
      [
        "beef-rice",
        "Cơm bò xào rau củ",
        "Cơm",
        45000,
        "Bò xào mềm cùng rau củ theo mùa, dùng với cơm trắng nóng.",
        "Gạo, thịt bò, rau củ, nước tương (đậu nành)",
        "/assets/rice.jpg",
      ],
      [
        "veggie-rice",
        "Cơm rau củ trứng",
        "Cơm",
        28000,
        "Rau củ nhiều màu cùng trứng và cơm trắng. Có thể ghi chú ít dầu khi đặt.",
        "Gạo, rau củ, trứng",
        "/assets/rice.jpg",
      ],
      [
        "peach-tea",
        "Trà đào",
        "Đồ uống",
        15000,
        "Trà đào thanh mát cho giờ nghỉ trưa. Ghi chú lượng đá theo sở thích.",
        "Trà, đào, đường, nước",
        "/assets/tea.jpg",
      ],
      [
        "fresh-milk",
        "Sữa tươi",
        "Đồ uống",
        12000,
        "Một ly sữa tươi mát. Có chứa sữa, không phù hợp với người dị ứng đạm sữa.",
        "Sữa bò",
        "/assets/milk.jpg",
      ],
    ];
    for (const d of dishes)
      await writer
        .prepare(
          "INSERT INTO dishes(id,name,category,price,description,components,image) VALUES(?,?,?,?,?,?,?)",
        )
        .run(...d);
    await writer
      .prepare("UPDATE dishes SET available=0 WHERE id='fresh-milk'")
      .run();
    const recipes = {
      "chicken-rice": {
        rice: 150,
        chicken: 100,
        vegetable: 50,
      },
      "beef-pho": {
        noodle: 200,
        beef: 100,
        vegetable: 30,
      },
      "egg-bread": {
        bread: 1,
        egg: 1,
        vegetable: 20,
      },
      "beef-rice": {
        rice: 150,
        beef: 100,
        vegetable: 80,
      },
      "veggie-rice": {
        rice: 150,
        egg: 1,
        vegetable: 100,
      },
      "peach-tea": {
        tea: 300,
      },
      "fresh-milk": {
        milk: 250,
      },
    };
    for (const [dish, recipe] of Object.entries(recipes))
      for (const [ingredient, amount] of Object.entries(recipe))
        await writer
          .prepare("INSERT INTO recipes VALUES(?,?,?)")
          .run(dish, ingredient, amount * 1000);
    await db.batch(statements);
  });
}
