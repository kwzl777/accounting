import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { remainingDebt, round2 } from '../calc.js';

const router = Router();

router.use(requireAuth);

// 所有客户档案列表（含统计：订单数、累计欠款、最近交易）
router.get('/', (_req, res) => {
  const customers = db
    .prepare(
      `SELECT c.id, c.name, c.phone, c.remark, c.created_at,
              COUNT(DISTINCT s.id) AS order_count,
              COALESCE(SUM(s.sales_amount - s.waived_amount), 0) AS net_sales,
              MAX(s.date) AS last_order_date
       FROM customers c
       LEFT JOIN shipments s ON s.customer_name = c.name
       GROUP BY c.id
       ORDER BY c.name`
    )
    .all();
  // 计算每个客户的剩余欠款
  const receipts = db
    .prepare('SELECT shipment_id, amount FROM receipts')
    .all() as Array<{ shipment_id: number; amount: number }>;
  const receivedByShipment = new Map<number, number>();
  for (const r of receipts) {
    receivedByShipment.set(r.shipment_id, round2((receivedByShipment.get(r.shipment_id) ?? 0) + r.amount));
  }
  const result = (customers as Array<{
    id: number; name: string; phone: string | null; remark: string | null;
    created_at: string; order_count: number; net_sales: number; last_order_date: string | null;
  }>).map((c) => {
    const shipments = db
      .prepare('SELECT id, sales_amount, waived_amount FROM shipments WHERE customer_name = ?')
      .all(c.name) as Array<{ id: number; sales_amount: number; waived_amount: number }>;
    let remaining = 0;
    for (const s of shipments) {
      remaining += remainingDebt(s.sales_amount, s.waived_amount, receivedByShipment.get(s.id) ?? 0);
    }
    return { ...c, net_sales: round2(c.net_sales), remaining: round2(remaining) };
  });
  res.json({ customers: result });
});

// 新建客户
router.post('/', (req, res) => {
  const body = (req.body ?? {}) as { name?: string; phone?: string; remark?: string };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: '客户名不能为空' });
    return;
  }
  const exists = db.prepare('SELECT id FROM customers WHERE name = ?').get(name);
  if (exists) {
    res.status(409).json({ error: '客户已存在' });
    return;
  }
  const now = new Date().toISOString();
  const info = db
    .prepare('INSERT INTO customers (name, phone, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(name, body.phone?.trim() || null, body.remark?.trim() || null, now, now);
  res.json({ id: info.lastInsertRowid, name });
});

// 编辑客户
router.put('/:id', (req, res) => {
  const id = Number(req.params.id);
  const body = (req.body ?? {}) as { name?: string; phone?: string; remark?: string };
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) {
    res.status(404).json({ error: '客户不存在' });
    return;
  }
  const name = typeof body.name === 'string' ? body.name.trim() : (customer as { name: string }).name;
  const now = new Date().toISOString();
  db.prepare('UPDATE customers SET name = ?, phone = ?, remark = ?, updated_at = ? WHERE id = ?')
    .run(name, body.phone?.trim() || null, body.remark?.trim() || null, now, id);
  res.json({ ok: true });
});

// 删除客户档案（不删除历史订单）
router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  db.prepare('DELETE FROM customers WHERE id = ?').run(id);
  res.json({ ok: true });
});

// 所有历史客户名（从出货记录去重），供下拉选择
router.get('/list', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT DISTINCT customer_name FROM shipments
       WHERE customer_name IS NOT NULL AND TRIM(customer_name) != ''
       ORDER BY customer_name`
    )
    .all() as Array<{ customer_name: string }>;
  res.json({ customers: rows.map((r) => r.customer_name) });
});

// 单个客户详情 + 历史订单
router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(id);
  if (!customer) {
    res.status(404).json({ error: '客户不存在' });
    return;
  }
  const orders = db
    .prepare(
      `SELECT s.id, s.date, s.product_name, s.flavor, s.quantity, s.unit_price,
              s.sales_amount, s.waived_amount, s.remark, b.name AS batch_name
       FROM shipments s LEFT JOIN batches b ON b.id = s.batch_id
       WHERE s.customer_name = ?
       ORDER BY s.date DESC, s.id DESC`
    )
    .all((customer as { name: string }).name);
  res.json({ customer, orders });
});

interface ShipmentRow {
  id: number;
  batch_id: number;
  batch_name: string;
  batch_date: string | null;
  customer_name: string;
  date: string | null;
  product_name: string | null;
  flavor: string | null;
  quantity: number;
  unit_price: number;
  sales_amount: number;
  waived_amount: number;
}

router.get('/debts', (_req, res) => {
  const shipments = db
    .prepare(
      `SELECT s.id, s.batch_id, s.customer_name, s.date, s.product_name, s.flavor,
              s.quantity, s.unit_price, s.sales_amount, s.waived_amount,
              b.name AS batch_name, b.date AS batch_date
       FROM shipments s JOIN batches b ON b.id = s.batch_id
       ORDER BY s.id`
    )
    .all() as ShipmentRow[];
  const receipts = db.prepare('SELECT shipment_id, amount FROM receipts').all() as Array<{
    shipment_id: number;
    amount: number;
  }>;
  const planTotals = db
    .prepare('SELECT batch_id, COALESCE(SUM(quantity), 0) AS q FROM plans GROUP BY batch_id')
    .all() as Array<{ batch_id: number; q: number }>;
  const batchQuantity = new Map(planTotals.map((row) => [row.batch_id, round2(row.q)]));

  const receivedByShipment = new Map<number, number>();
  for (const receipt of receipts) {
    receivedByShipment.set(
      receipt.shipment_id,
      round2((receivedByShipment.get(receipt.shipment_id) ?? 0) + receipt.amount)
    );
  }

  const byCustomer = new Map<
    string,
    {
      customer_name: string;
      first_date: string;
      total_sales: number;
      total_waived: number;
      total_received: number;
      total_remaining: number;
      batches: Map<
        number,
        {
          batch_id: number;
          batch_name: string;
          batch_date: string | null;
          total_quantity: number;
          sales: number;
          waived: number;
          received: number;
          remaining: number;
          shipments: Array<{
            id: number;
            date: string | null;
            product_name: string | null;
            flavor: string | null;
            quantity: number;
            unit_price: number;
            sales_amount: number;
            waived_amount: number;
            received: number;
            remaining: number;
          }>;
        }
      >;
    }
  >();

  for (const shipment of shipments) {
    const received = receivedByShipment.get(shipment.id) ?? 0;
    const remaining = remainingDebt(
      shipment.sales_amount,
      shipment.waived_amount,
      received
    );
    const date = shipment.date ?? shipment.batch_date ?? '';
    const entry = byCustomer.get(shipment.customer_name) ?? {
      customer_name: shipment.customer_name,
      first_date: date,
      total_sales: 0,
      total_waived: 0,
      total_received: 0,
      total_remaining: 0,
      batches: new Map(),
    };
    if (date && (!entry.first_date || date < entry.first_date)) {
      entry.first_date = date;
    }
    entry.total_sales = round2(entry.total_sales + shipment.sales_amount);
    entry.total_waived = round2(entry.total_waived + shipment.waived_amount);
    entry.total_received = round2(entry.total_received + received);
    entry.total_remaining = round2(entry.total_remaining + remaining);

    const batchEntry = entry.batches.get(shipment.batch_id) ?? {
      batch_id: shipment.batch_id,
      batch_name: shipment.batch_name,
      batch_date: shipment.batch_date,
      total_quantity: batchQuantity.get(shipment.batch_id) ?? 0,
      sales: 0,
      waived: 0,
      received: 0,
      remaining: 0,
      shipments: [],
    };
    batchEntry.sales = round2(batchEntry.sales + shipment.sales_amount);
    batchEntry.waived = round2(batchEntry.waived + shipment.waived_amount);
    batchEntry.received = round2(batchEntry.received + received);
    batchEntry.remaining = round2(batchEntry.remaining + remaining);
    batchEntry.shipments.push({
      id: shipment.id,
      date: shipment.date,
      product_name: shipment.product_name,
      flavor: shipment.flavor,
      quantity: round2(shipment.quantity),
      unit_price: round2(shipment.unit_price),
      sales_amount: round2(shipment.sales_amount),
      waived_amount: round2(shipment.waived_amount),
      received,
      remaining,
    });
    entry.batches.set(shipment.batch_id, batchEntry);

    byCustomer.set(shipment.customer_name, entry);
  }

  res.json({
    customers: [...byCustomer.values()]
      .map((entry) => {
        const batches = [...entry.batches.values()]
          .filter((batch) => batch.remaining > 0)
          .sort((a, b) => {
            const dateA = a.batch_date ?? '';
            const dateB = b.batch_date ?? '';
            if (dateA !== dateB) return dateA < dateB ? -1 : 1;
            return a.batch_id - b.batch_id;
          })
          .map((batch) => ({
            ...batch,
            shipments: batch.shipments.sort((a, b) => {
              const dateA = a.date ?? '';
              const dateB = b.date ?? '';
              if (dateA !== dateB) return dateA < dateB ? -1 : 1;
              return a.id - b.id;
            }),
          }));
        return {
          customer_name: entry.customer_name,
          first_date: entry.first_date,
          total_sales: round2(batches.reduce((sum, batch) => sum + batch.sales, 0)),
          total_waived: round2(batches.reduce((sum, batch) => sum + batch.waived, 0)),
          total_received: round2(batches.reduce((sum, batch) => sum + batch.received, 0)),
          total_remaining: round2(batches.reduce((sum, batch) => sum + batch.remaining, 0)),
          batches,
        };
      })
      .filter((entry) => entry.batches.length > 0)
      .sort((a, b) => {
        if (a.first_date !== b.first_date) return a.first_date < b.first_date ? -1 : 1;
        return a.customer_name.localeCompare(b.customer_name);
      }),
  });
});

router.post('/repay', (req, res) => {
  const body = (req.body ?? {}) as {
    batchId?: number;
    customerName?: string;
    amount?: number;
  };
  const batchId = Number(body.batchId);
  const customerName =
    typeof body.customerName === 'string' ? body.customerName.trim() : '';
  const amount = Number(body.amount ?? 0);
  if (!customerName) {
    res.status(400).json({ error: '客户名称不能为空' });
    return;
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: '还款金额必须大于 0' });
    return;
  }
  const shipments = db
    .prepare(
      'SELECT * FROM shipments WHERE batch_id = ? AND customer_name = ? ORDER BY id'
    )
    .all(batchId, customerName) as Array<{
    id: number;
    sales_amount: number;
    waived_amount: number;
  }>;
  if (shipments.length === 0) {
    res.status(404).json({ error: '没有找到该客户的出货记录' });
    return;
  }
  const netReceivable = round2(
    shipments.reduce((sum, row) => sum + row.sales_amount - row.waived_amount, 0)
  );
  const existingTotal = round2(
    (
      db
        .prepare(
          `SELECT COALESCE(SUM(r.amount), 0) AS s FROM receipts r
           JOIN shipments s ON s.id = r.shipment_id
           WHERE s.batch_id = ? AND s.customer_name = ?`
        )
        .get(batchId, customerName) as { s: number }
    ).s
  );
  const remaining = round2(Math.max(netReceivable - existingTotal, 0));
  if (amount > remaining) {
    res.status(400).json({ error: `还款金额超过欠款（剩余 ${remaining}）` });
    return;
  }

  const now = new Date().toISOString();
  const date = now.slice(0, 10);
  let left = amount;
  const run = db.transaction(() => {
    for (const shipment of shipments) {
      if (left <= 0) break;
      const received = (
        db
          .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM receipts WHERE shipment_id = ?')
          .get(shipment.id) as { s: number }
      ).s;
      const capacity = round2(shipment.sales_amount - shipment.waived_amount - received);
      if (capacity <= 0) continue;
      const take = Math.min(capacity, left);
      db.prepare(
        'INSERT INTO receipts (batch_id, shipment_id, date, amount, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
      ).run(batchId, shipment.id, date, take, '还款', now, now);
      left = round2(left - take);
    }
    if (left > 0) {
      throw new Error(`还款金额超过可收余额（剩余 ${remaining}）`);
    }
  });
  try {
    run();
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : '还款失败',
    });
    return;
  }
  res.json({ ok: true });
});

export default router;
