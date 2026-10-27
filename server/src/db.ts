import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';

export interface UserRow {
  id: number;
  username: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DATABASE_PATH
  ? path.resolve(process.env.DATABASE_PATH)
  : path.resolve(currentDir, '..', '..', 'data', 'accounting.db');

mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath);

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS batches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  date TEXT,
  remark TEXT,
  status TEXT NOT NULL DEFAULT '预定中',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  flavor TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0,
  amount REAL NOT NULL DEFAULT 0,
  remark TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plan_bookings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id INTEGER NOT NULL,
  batch_id INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0,
  preorder_id INTEGER,
  shipment_id INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS preorders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  customer_name TEXT NOT NULL,
  unit_price REAL NOT NULL DEFAULT 0,
  date TEXT,
  total_quantity REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  batch_id INTEGER,
  product_name TEXT NOT NULL,
  ship_date TEXT NOT NULL,
  total_quantity REAL NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0,
  rmb_amount REAL NOT NULL DEFAULT 0,
  freight REAL NOT NULL DEFAULT 0,
  exchange_rate REAL,
  buy_rate REAL,
  sell_rate REAL,
  fee REAL NOT NULL DEFAULT 0,
  u_amount REAL NOT NULL DEFAULT 0,
  exchange_loss REAL,
  u_paid REAL NOT NULL DEFAULT 0,
  unpaid_u REAL NOT NULL DEFAULT 0,
  cost_amount REAL NOT NULL DEFAULT 0,
  details_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shipment_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shipment_id INTEGER NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  supplier TEXT,
  base_price REAL NOT NULL DEFAULT 0,
  remark TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS product_flavors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  flavor TEXT NOT NULL,
  price REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS arrival_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  plan_id INTEGER NOT NULL,
  date TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  unit_price REAL,
  amount REAL NOT NULL DEFAULT 0,
  supplier TEXT,
  remark TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  customer_name TEXT NOT NULL,
  date TEXT,
  product_name TEXT,
  flavor TEXT,
  quantity REAL NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0,
  sales_amount REAL NOT NULL DEFAULT 0,
  waived_amount REAL NOT NULL DEFAULT 0,
  remark TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS receipts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  shipment_id INTEGER NOT NULL,
  date TEXT,
  amount REAL NOT NULL DEFAULT 0,
  remark TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  date TEXT,
  category TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  description TEXT,
  voucher_url TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS currency_exchanges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  date TEXT,
  rmb_amount REAL NOT NULL DEFAULT 0,
  usd_amount REAL NOT NULL DEFAULT 0,
  buy_rate REAL,
  settle_rate REAL,
  fee REAL NOT NULL DEFAULT 0,
  include_fee INTEGER NOT NULL DEFAULT 0,
  loss REAL,
  remark TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dividends (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL UNIQUE,
  quantity REAL NOT NULL DEFAULT 0,
  profit REAL NOT NULL DEFAULT 0,
  total_amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  confirmed_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dividend_allocations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  dividend_id INTEGER NOT NULL,
  investor_name TEXT NOT NULL,
  contribution_amount REAL NOT NULL DEFAULT 0,
  ratio REAL NOT NULL DEFAULT 0,
  share_amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dividend_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  allocation_id INTEGER NOT NULL,
  date TEXT,
  amount REAL NOT NULL DEFAULT 0,
  remark TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS dividend_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  batch_name TEXT NOT NULL,
  batch_code TEXT NOT NULL DEFAULT '',
  amount REAL NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'unpaid',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS general_expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT,
  reason TEXT NOT NULL,
  amount REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity TEXT NOT NULL,
  record_id INTEGER,
  action TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  phone TEXT,
  remark TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);

const now = new Date().toISOString();

// 轻量迁移：为已有数据库补充新字段
function ensureColumn(table: string, column: string, ddl: string) {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((item) => item.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
  }
}
ensureColumn('batches', 'expected_arrival_date', 'expected_arrival_date TEXT');
ensureColumn('batches', 'product_id', 'product_id INTEGER');
ensureColumn('batches', 'manual_dividend', 'manual_dividend REAL NOT NULL DEFAULT 0');
ensureColumn('dividends', 'quantity', 'quantity REAL NOT NULL DEFAULT 0');
ensureColumn('dividends', 'profit', 'profit REAL NOT NULL DEFAULT 0');
ensureColumn('dividend_records', 'batch_code', "batch_code TEXT NOT NULL DEFAULT ''");
db.exec(`
UPDATE dividends
SET quantity = 1, profit = ROUND(total_amount / 0.3, 2)
WHERE total_amount > 0 AND quantity = 0 AND profit = 0
`);
ensureColumn('shipments', 'plan_id', 'plan_id INTEGER');
ensureColumn('plan_bookings', 'preorder_id', 'preorder_id INTEGER');
ensureColumn('plan_bookings', 'shipment_id', 'shipment_id INTEGER');
ensureColumn('arrival_records', 'supplier', 'supplier TEXT');
ensureColumn('products', 'supplier', 'supplier TEXT');
ensureColumn('products', 'base_price', 'base_price REAL NOT NULL DEFAULT 0');
ensureColumn('products', 'remark', 'remark TEXT');
ensureColumn('product_shipments', 'details_json', 'details_json TEXT');
ensureColumn('product_shipments', 'exchange_rate', 'exchange_rate REAL');
ensureColumn('product_shipments', 'cost_amount', 'cost_amount REAL NOT NULL DEFAULT 0');
ensureColumn('product_shipments', 'batch_id', 'batch_id INTEGER');

// 旧版本 product_shipments 对 product_id 有唯一约束，改为允许多次发货
const shipmentTable = db
  .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'product_shipments'")
  .get() as { sql: string } | undefined;
if (shipmentTable && /UNIQUE/i.test(shipmentTable.sql)) {
  db.exec('ALTER TABLE product_shipments RENAME TO product_shipments_old');
  db.exec(`
CREATE TABLE product_shipments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL,
  product_name TEXT NOT NULL,
  ship_date TEXT NOT NULL,
  total_quantity REAL NOT NULL DEFAULT 0,
  unit_price REAL NOT NULL DEFAULT 0,
  rmb_amount REAL NOT NULL DEFAULT 0,
  freight REAL NOT NULL DEFAULT 0,
  exchange_rate REAL,
  buy_rate REAL,
  sell_rate REAL,
  fee REAL NOT NULL DEFAULT 0,
  u_amount REAL NOT NULL DEFAULT 0,
  exchange_loss REAL,
  u_paid REAL NOT NULL DEFAULT 0,
  unpaid_u REAL NOT NULL DEFAULT 0,
  cost_amount REAL NOT NULL DEFAULT 0,
  details_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
`);
  db.exec(`
INSERT INTO product_shipments
  (id, product_id, product_name, ship_date, total_quantity, unit_price, rmb_amount, freight,
   buy_rate, sell_rate, fee, u_amount, exchange_loss, u_paid, unpaid_u, details_json, created_at, updated_at)
SELECT
  id, product_id, product_name, ship_date, total_quantity, unit_price, rmb_amount, freight,
  buy_rate, sell_rate, fee, u_amount, exchange_loss, u_paid, unpaid_u, details_json, created_at, updated_at
FROM product_shipments_old
`);
  db.exec('DROP TABLE product_shipments_old');
}

ensureColumn('product_shipments', 'details_json', 'details_json TEXT');
ensureColumn('product_shipments', 'exchange_rate', 'exchange_rate REAL');
ensureColumn('product_shipments', 'cost_amount', 'cost_amount REAL NOT NULL DEFAULT 0');
ensureColumn('product_shipments', 'batch_id', 'batch_id INTEGER');
db.exec(`
UPDATE product_shipments
SET batch_id = (
  SELECT b.id FROM batches b
  WHERE b.product_id = product_shipments.product_id
    AND b.date = product_shipments.ship_date
  ORDER BY b.id DESC LIMIT 1
)
WHERE batch_id IS NULL
`);

// 历史出货回填：按批次 + 口味关联到预定项
db.exec(`
UPDATE shipments
SET plan_id = (
  SELECT p.id FROM plans p
  WHERE p.batch_id = shipments.batch_id AND p.flavor = shipments.flavor
  ORDER BY p.id LIMIT 1
)
WHERE plan_id IS NULL AND flavor IS NOT NULL
`);

// 客户档案迁移：把历史 shipments / preorders 里出现过的客户名导入 customers 表
const migrateCustomers = db.transaction(() => {
  const names = db
    .prepare(
      `SELECT DISTINCT customer_name FROM (
         SELECT customer_name FROM shipments
         UNION
         SELECT customer_name FROM preorders
       ) WHERE customer_name IS NOT NULL AND TRIM(customer_name) != ''`
    )
    .all() as Array<{ customer_name: string }>;
  const insert = db.prepare(
    'INSERT OR IGNORE INTO customers (name, created_at, updated_at) VALUES (?, ?, ?)'
  );
  for (const row of names) {
    insert.run(row.customer_name, now, now);
  }
});
migrateCustomers();

const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number };
if (userCount.c === 0) {
  const passwordHash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'admin123', 10);
  db.prepare(
    'INSERT INTO users (username, password_hash, created_at, updated_at) VALUES (?, ?, ?, ?)'
  ).run('admin', passwordHash, now, now);
}

const DEFAULT_EXPENSE_CATEGORIES = [
  '运费',
  '加油',
  '过路费',
  '餐饮',
  '住宿',
  '话费',
  '烟酒',
  '送礼',
  '杂费',
];
const categoryCount = db.prepare('SELECT COUNT(*) AS c FROM expense_categories').get() as {
  c: number;
};
if (categoryCount.c === 0) {
  const insertCategory = db.prepare(
    'INSERT OR IGNORE INTO expense_categories (name, is_default, created_at) VALUES (?, 1, ?)'
  );
  for (const name of DEFAULT_EXPENSE_CATEGORIES) {
    insertCategory.run(name, now);
  }
}

export { db };
export default db;
