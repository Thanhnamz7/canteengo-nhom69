CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, phone TEXT UNIQUE,
 password_hash TEXT NOT NULL, role TEXT NOT NULL CHECK(role IN ('customer','staff','admin')),
 kind TEXT NOT NULL DEFAULT 'external' CHECK(kind IN ('school','external')),
 allergies TEXT NOT NULL DEFAULT '', balance INTEGER NOT NULL DEFAULT 0 CHECK(balance>=0),
 active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0,1)), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts (key TEXT PRIMARY KEY, attempts INTEGER NOT NULL, locked_until INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS suppliers (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL DEFAULT '', address TEXT NOT NULL DEFAULT '');
CREATE TABLE IF NOT EXISTS ingredients (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, unit TEXT NOT NULL CHECK(unit IN ('g','ml','cái')),
 stock INTEGER NOT NULL CHECK(stock>=0), minimum INTEGER NOT NULL CHECK(minimum>=0), supplier_id TEXT REFERENCES suppliers(id)
);
CREATE TABLE IF NOT EXISTS dishes (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>0),
 description TEXT NOT NULL, components TEXT NOT NULL DEFAULT '', image TEXT NOT NULL DEFAULT '',
 available INTEGER NOT NULL DEFAULT 1 CHECK(available IN (0,1)), deleted INTEGER NOT NULL DEFAULT 0,
 weekdays TEXT NOT NULL DEFAULT '[0,1,2,3,4,5,6]'
);
CREATE TABLE IF NOT EXISTS recipes (
 dish_id TEXT NOT NULL REFERENCES dishes(id), ingredient_id TEXT NOT NULL REFERENCES ingredients(id),
 quantity INTEGER NOT NULL CHECK(quantity>0), PRIMARY KEY(dish_id,ingredient_id)
);
CREATE TABLE IF NOT EXISTS slots (id TEXT PRIMARY KEY, starts_at TEXT NOT NULL, ends_at TEXT NOT NULL, capacity INTEGER NOT NULL CHECK(capacity>0));
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), slot_id TEXT NOT NULL REFERENCES slots(id),
 total INTEGER NOT NULL CHECK(total>0), status TEXT NOT NULL CHECK(status IN ('pending','preparing','ready','completed','cancelled')),
 reference TEXT NOT NULL, fingerprint TEXT NOT NULL, created_at TEXT NOT NULL, completed_at TEXT,
 UNIQUE(user_id,reference)
);
CREATE TABLE IF NOT EXISTS order_items (
 id INTEGER PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), dish_id TEXT NOT NULL REFERENCES dishes(id),
 name TEXT NOT NULL, price INTEGER NOT NULL CHECK(price>0), quantity INTEGER NOT NULL CHECK(quantity>0), note TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS payments (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), order_id TEXT REFERENCES orders(id),
 type TEXT NOT NULL CHECK(type IN ('payment','refund','topup')), amount INTEGER NOT NULL CHECK(amount>0),
 reference TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS stock_movements (
 id TEXT PRIMARY KEY, ingredient_id TEXT NOT NULL REFERENCES ingredients(id), quantity INTEGER NOT NULL CHECK(quantity<>0),
 type TEXT NOT NULL CHECK(type IN ('opening','in','out','consume','restore')), order_id TEXT REFERENCES orders(id),
 actor_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, reference TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS order_history (
 id INTEGER PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), status TEXT NOT NULL,
 actor_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS reviews (
 id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), dish_id TEXT NOT NULL REFERENCES dishes(id),
 user_id TEXT NOT NULL REFERENCES users(id), rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
 comment TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(order_id,dish_id)
);
CREATE TABLE IF NOT EXISTS audit_log (
 id INTEGER PRIMARY KEY, actor_id TEXT NOT NULL REFERENCES users(id), action TEXT NOT NULL,
 entity_id TEXT NOT NULL, detail TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_orders_slot ON orders(slot_id,status);
CREATE INDEX IF NOT EXISTS ix_orders_user ON orders(user_id,created_at);
CREATE INDEX IF NOT EXISTS ix_movements_order ON stock_movements(order_id,type);
