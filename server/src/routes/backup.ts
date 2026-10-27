import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';

const router = Router();

router.use(requireAuth);

/** 业务数据表（不含 users / 认证信息） */
const BUSINESS_TABLES = [
  'products',
  'product_flavors',
  'batches',
  'plans',
  'preorders',
  'product_shipments',
  'shipment_payments',
  'plan_bookings',
  'arrival_records',
  'shipments',
  'receipts',
  'expenses',
  'expense_categories',
  'currency_exchanges',
  'dividends',
  'dividend_allocations',
  'dividend_payments',
  'app_settings',
];

/** 恢复时的插入顺序（依赖关系） */
const INSERT_ORDER = [
  'expense_categories',
  'products',
  'product_flavors',
  'batches',
  'plans',
  'preorders',
  'product_shipments',
  'shipment_payments',
  'plan_bookings',
  'arrival_records',
  'shipments',
  'receipts',
  'expenses',
  'currency_exchanges',
  'dividends',
  'dividend_allocations',
  'dividend_payments',
  'app_settings',
];

router.get('/', (_req, res) => {
  const data: Record<string, unknown[]> = {};
  for (const table of BUSINESS_TABLES) {
    data[table] = db.prepare(`SELECT * FROM ${table}`).all();
  }
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="backup-${new Date().toISOString().slice(0, 10)}.json"`
  );
  res.json({ version: 1, exported_at: new Date().toISOString(), data });
});

router.post('/restore', (req, res) => {
  const body = (req.body ?? {}) as {
    confirm?: boolean;
    version?: number;
    data?: Record<string, unknown[]>;
  };
  if (body.confirm !== true) {
    res.status(400).json({ error: '恢复备份需要二次确认（confirm: true）' });
    return;
  }
  if (!body.data || typeof body.data !== 'object') {
    res.status(400).json({ error: '备份数据格式不正确' });
    return;
  }

  const transaction = db.transaction(() => {
    for (const table of [...INSERT_ORDER].reverse()) {
      db.prepare(`DELETE FROM ${table}`).run();
    }
    for (const table of INSERT_ORDER) {
      const rows = body.data?.[table];
      if (!Array.isArray(rows) || rows.length === 0) continue;
      const columns = Object.keys(rows[0] as Record<string, unknown>).filter((column) =>
        /^[a-z_]+$/.test(column)
      );
      if (columns.length === 0) continue;
      const insert = db.prepare(
        `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns
          .map(() => '?')
          .join(', ')})`
      );
      for (const row of rows) {
        const record = row as Record<string, unknown>;
        insert.run(...columns.map((column) => (record[column] === undefined ? null : record[column])));
      }
    }
  });

  try {
    transaction();
    res.json({ ok: true, restored_at: new Date().toISOString() });
  } catch (error) {
    res.status(500).json({
      error: '恢复失败：' + (error instanceof Error ? error.message : String(error)),
    });
  }
});

export default router;
