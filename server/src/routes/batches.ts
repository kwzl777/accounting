import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { planAmount, arrivalAmount, shortage, overage, avgUnitPrice, round2 } from '../calc.js';
import { logAudit } from '../services/audit.js';

const router = Router();

router.use(requireAuth);

router.get('/', (_req, res) => {
  const batches = db.prepare('SELECT * FROM batches ORDER BY updated_at DESC').all();
  res.json(batches);
});

router.post('/', (req, res) => {
  const body = (req.body ?? {}) as {
    name?: string;
    date?: string;
    expectedArrivalDate?: string;
    remark?: string;
  };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: '批次名称不能为空' });
    return;
  }
  const expectedArrivalDate =
    typeof body.expectedArrivalDate === 'string' && body.expectedArrivalDate.trim()
      ? body.expectedArrivalDate.trim()
      : null;
  const now = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO batches (name, date, expected_arrival_date, remark, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      name,
      body.date ?? null,
      expectedArrivalDate,
      body.remark ?? null,
      '预定中',
      now,
      now
    );
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(Number(info.lastInsertRowid)) as Record<
    string,
    unknown
  >;
  logAudit('batch', Number(info.lastInsertRowid), 'create', null, batch);
  res.status(201).json(batch);
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!batch) {
    res.status(404).json({ error: '批次不存在' });
    return;
  }
  const plans = db.prepare('SELECT * FROM plans WHERE batch_id = ? ORDER BY id').all(id);
  const bookings = db
    .prepare('SELECT * FROM plan_bookings WHERE batch_id = ? ORDER BY id')
    .all(id);
  res.json({ batch, plans, bookings });
});

router.patch('/:id', (req, res) => {
  const id = Number(req.params.id);
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!batch) {
    res.status(404).json({ error: '批次不存在' });
    return;
  }
  const body = (req.body ?? {}) as {
    name?: string;
    date?: string;
    expectedArrivalDate?: string;
    remark?: string;
    status?: string;
  };
  const name = body.name !== undefined ? String(body.name).trim() : String(batch.name);
  if (!name) {
    res.status(400).json({ error: '批次名称不能为空' });
    return;
  }
  const expectedArrivalDate =
    body.expectedArrivalDate !== undefined
      ? typeof body.expectedArrivalDate === 'string' && body.expectedArrivalDate.trim()
        ? body.expectedArrivalDate.trim()
        : null
      : ((batch.expected_arrival_date as string | null | undefined) ?? null);
  db.prepare(
    'UPDATE batches SET name = ?, date = ?, expected_arrival_date = ?, remark = ?, status = ?, updated_at = ? WHERE id = ?'
  ).run(
    name,
    body.date ?? batch.date,
    expectedArrivalDate,
    body.remark ?? batch.remark,
    body.status ?? batch.status,
    new Date().toISOString(),
    id
  );
  const after = db.prepare('SELECT * FROM batches WHERE id = ?').get(id) as Record<string, unknown>;
  logAudit('batch', id, 'update', batch, after);
  res.json(after);
});

router.get('/:id/plans', (req, res) => {
  const batchId = Number(req.params.id);
  const plans = db.prepare('SELECT * FROM plans WHERE batch_id = ? ORDER BY id').all(batchId);
  res.json(plans);
});

router.post('/:id/plans', (req, res) => {
  const batchId = Number(req.params.id);
  const body = (req.body ?? {}) as {
    productName?: string;
    flavor?: string;
    quantity?: number;
    unitPrice?: number;
    remark?: string;
  };
  const productName = typeof body.productName === 'string' ? body.productName.trim() : '';
  const flavor = typeof body.flavor === 'string' ? body.flavor.trim() : '';
  const quantity = Number(body.quantity ?? 0);
  const unitPrice = Number(body.unitPrice ?? 0);
  if (!flavor) {
    res.status(400).json({ error: '口味不能为空' });
    return;
  }
  if (!Number.isFinite(quantity) || quantity < 0) {
    res.status(400).json({ error: '预定数量不能为负数' });
    return;
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    res.status(400).json({ error: '预定单价不能为负数' });
    return;
  }
  const now = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO plans (batch_id, product_name, flavor, quantity, unit_price, amount, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(batchId, productName, flavor, quantity, unitPrice, planAmount(quantity, unitPrice), body.remark ?? null, now, now);
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(Number(info.lastInsertRowid)) as Record<
    string,
    unknown
  >;
  const batchStatus = db.prepare('SELECT status FROM batches WHERE id = ?').get(batchId) as
    | { status: string }
    | undefined;
  if (batchStatus && batchStatus.status === '预定中') {
    db.prepare('UPDATE batches SET status = ?, updated_at = ? WHERE id = ?').run('待到货', now, batchId);
  }
  logAudit('plan', Number(info.lastInsertRowid), 'create', null, plan);
  res.status(201).json(plan);
});

router.patch('/:id/plans/:planId', (req, res) => {
  const batchId = Number(req.params.id);
  const planId = Number(req.params.planId);
  const body = (req.body ?? {}) as { productName?: string; flavor?: string; quantity?: number; unitPrice?: number; remark?: string };
  const plan = db.prepare('SELECT * FROM plans WHERE id = ? AND batch_id = ?').get(planId, batchId) as
    | Record<string, unknown>
    | undefined;
  if (!plan) {
    res.status(404).json({ error: '预定记录不存在' });
    return;
  }
  const productName = body.productName !== undefined ? String(body.productName).trim() : String(plan.product_name);
  const flavor = body.flavor !== undefined ? String(body.flavor).trim() : String(plan.flavor);
  const quantity = body.quantity !== undefined ? Number(body.quantity) : Number(plan.quantity);
  const unitPrice = body.unitPrice !== undefined ? Number(body.unitPrice) : Number(plan.unit_price);
  if (!flavor) {
    res.status(400).json({ error: '口味不能为空' });
    return;
  }
  if (!Number.isFinite(quantity) || quantity < 0) {
    res.status(400).json({ error: '预定数量不能为负数' });
    return;
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    res.status(400).json({ error: '预定单价不能为负数' });
    return;
  }
  db.prepare('UPDATE plans SET product_name = ?, flavor = ?, quantity = ?, unit_price = ?, amount = ?, remark = ?, updated_at = ? WHERE id = ?').run(
    productName,
    flavor,
    quantity,
    unitPrice,
    planAmount(quantity, unitPrice),
    body.remark ?? plan.remark,
    new Date().toISOString(),
    planId
  );
  const after = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as Record<string, unknown>;
  logAudit('plan', planId, 'update', plan, after);
  res.json(after);
});

router.delete('/:id/plans/:planId', (req, res) => {
  const batchId = Number(req.params.id);
  const planId = Number(req.params.planId);
  const before = db
    .prepare('SELECT * FROM plans WHERE id = ? AND batch_id = ?')
    .get(planId, batchId);
  db.prepare('DELETE FROM plan_bookings WHERE plan_id = ? AND batch_id = ?').run(planId, batchId);
  db.prepare('DELETE FROM plans WHERE id = ? AND batch_id = ?').run(planId, batchId);
  if (before) logAudit('plan', planId, 'delete', before, null);
  res.status(204).end();
});

/** 预订人明细变化后，同步口味的总预订数量与金额 */
function syncPlanTotal(planId: number): void {
  const plan = db.prepare('SELECT * FROM plans WHERE id = ?').get(planId) as
    | { id: number; unit_price: number }
    | undefined;
  if (!plan) return;
  const row = db
    .prepare(
      'SELECT COUNT(*) AS c, COALESCE(SUM(quantity), 0) AS q FROM plan_bookings WHERE plan_id = ?'
    )
    .get(planId) as { c: number; q: number };
  const quantity = round2(row.q);
  db.prepare('UPDATE plans SET quantity = ?, amount = ?, updated_at = ? WHERE id = ?').run(
    quantity,
    planAmount(quantity, Number(plan.unit_price)),
    new Date().toISOString(),
    planId
  );
}

function getPlanBookings(planId: number) {
  return db
    .prepare('SELECT * FROM plan_bookings WHERE plan_id = ? ORDER BY id')
    .all(planId);
}

router.post('/:id/plans/:planId/bookings', (req, res) => {
  const batchId = Number(req.params.id);
  const planId = Number(req.params.planId);
  const plan = db
    .prepare('SELECT id FROM plans WHERE id = ? AND batch_id = ?')
    .get(planId, batchId);
  if (!plan) {
    res.status(404).json({ error: '预定记录不存在' });
    return;
  }
  const body = (req.body ?? {}) as { customerName?: string; quantity?: number };
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
  const quantity = Number(body.quantity ?? 0);
  if (!customerName) {
    res.status(400).json({ error: '客户名称不能为空' });
    return;
  }
  if (!Number.isFinite(quantity) || quantity < 0) {
    res.status(400).json({ error: '预订数量不能为负数' });
    return;
  }
  const now = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO plan_bookings (plan_id, batch_id, customer_name, quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(planId, batchId, customerName, round2(quantity), now, now);
  syncPlanTotal(planId);
  const booking = db
    .prepare('SELECT * FROM plan_bookings WHERE id = ?')
    .get(Number(info.lastInsertRowid));
  logAudit('booking', Number(info.lastInsertRowid), 'create', null, booking);
  res.status(201).json({ booking, bookings: getPlanBookings(planId) });
});

router.patch('/:id/plans/:planId/bookings/:bookingId', (req, res) => {
  const batchId = Number(req.params.id);
  const planId = Number(req.params.planId);
  const bookingId = Number(req.params.bookingId);
  const booking = db
    .prepare('SELECT * FROM plan_bookings WHERE id = ? AND plan_id = ? AND batch_id = ?')
    .get(bookingId, planId, batchId) as Record<string, unknown> | undefined;
  if (!booking) {
    res.status(404).json({ error: '预订记录不存在' });
    return;
  }
  const body = (req.body ?? {}) as { customerName?: string; quantity?: number };
  const customerName =
    body.customerName !== undefined ? String(body.customerName).trim() : String(booking.customer_name);
  const quantity = body.quantity !== undefined ? Number(body.quantity) : Number(booking.quantity);
  if (!customerName) {
    res.status(400).json({ error: '客户名称不能为空' });
    return;
  }
  if (!Number.isFinite(quantity) || quantity < 0) {
    res.status(400).json({ error: '预订数量不能为负数' });
    return;
  }
  db.prepare(
    'UPDATE plan_bookings SET customer_name = ?, quantity = ?, updated_at = ? WHERE id = ?'
  ).run(customerName, round2(quantity), new Date().toISOString(), bookingId);
  syncPlanTotal(planId);
  const after = db.prepare('SELECT * FROM plan_bookings WHERE id = ?').get(bookingId);
  logAudit('booking', bookingId, 'update', booking, after);
  res.json({ booking: after, bookings: getPlanBookings(planId) });
});

router.delete('/:id/plans/:planId/bookings/:bookingId', (req, res) => {
  const batchId = Number(req.params.id);
  const planId = Number(req.params.planId);
  const bookingId = Number(req.params.bookingId);
  const before = db
    .prepare('SELECT * FROM plan_bookings WHERE id = ? AND plan_id = ? AND batch_id = ?')
    .get(bookingId, planId, batchId);
  db.prepare('DELETE FROM plan_bookings WHERE id = ? AND plan_id = ? AND batch_id = ?').run(
    bookingId,
    planId,
    batchId
  );
  syncPlanTotal(planId);
  if (before) logAudit('booking', bookingId, 'delete', before, null);
  res.status(204).end();
});

interface ArrivalRow {
  id: number;
  batch_id: number;
  plan_id: number;
  date: string | null;
  quantity: number;
  unit_price: number | null;
  amount: number;
  remark: string | null;
}

function buildArrivalView(batchId: number) {
  const plans = db.prepare('SELECT * FROM plans WHERE batch_id = ? ORDER BY id').all(batchId) as Array<{
    id: number;
    product_name: string;
    flavor: string;
    quantity: number;
    unit_price: number;
    amount: number;
  }>;
  const records = db
    .prepare('SELECT * FROM arrival_records WHERE batch_id = ? ORDER BY id')
    .all(batchId) as ArrivalRow[];

  const byPlan = new Map<number, ArrivalRow[]>();
  for (const record of records) {
    const list = byPlan.get(record.plan_id) ?? [];
    list.push(record);
    byPlan.set(record.plan_id, list);
  }

  let actualTotalAmount = 0;
  const planViews = plans.map((plan) => {
    const recs = byPlan.get(plan.id) ?? [];
    const actualQuantity = round2(recs.reduce((sum, r) => sum + r.quantity, 0));
    const actualAmount = round2(recs.reduce((sum, r) => sum + r.amount, 0));
    actualTotalAmount = round2(actualTotalAmount + actualAmount);
    return {
      plan_id: plan.id,
      product_name: plan.product_name,
      flavor: plan.flavor,
      planned_quantity: plan.quantity,
      planned_unit_price: plan.unit_price,
      planned_amount: plan.amount,
      actual_quantity: actualQuantity,
      actual_amount: actualAmount,
      avg_unit_price: avgUnitPrice(actualAmount, actualQuantity),
      shortage: shortage(plan.quantity, actualQuantity),
      overage: overage(plan.quantity, actualQuantity),
      amount_diff: round2(actualAmount - plan.amount),
    };
  });

  return {
    plans: planViews,
    records,
    summary: { actual_total_amount: actualTotalAmount },
  };
}

function updateStatusAfterArrival(batchId: number): void {
  const batch = db.prepare('SELECT status FROM batches WHERE id = ?').get(batchId) as
    | { status: string }
    | undefined;
  if (!batch) return;
  if (['经营中', '已结算', '已归档'].includes(batch.status)) return;

  const recordCount = (
    db.prepare('SELECT COUNT(*) AS c FROM arrival_records WHERE batch_id = ?').get(batchId) as { c: number }
  ).c;
  if (recordCount === 0) return;

  const planCount = (
    db.prepare('SELECT COUNT(*) AS c FROM plans WHERE batch_id = ?').get(batchId) as { c: number }
  ).c;
  const fullCount = (
    db
      .prepare(
        `SELECT COUNT(*) AS c FROM plans p
         WHERE p.batch_id = ?
           AND (SELECT COALESCE(SUM(a.quantity), 0) FROM arrival_records a WHERE a.plan_id = p.id) >= p.quantity`
      )
      .get(batchId) as { c: number }
  ).c;

  const status = fullCount >= planCount ? '到货完成' : '部分到货';
  db.prepare('UPDATE batches SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    new Date().toISOString(),
    batchId
  );
}

router.get('/:id/arrivals', (req, res) => {
  const batchId = Number(req.params.id);
  const batch = db.prepare('SELECT id FROM batches WHERE id = ?').get(batchId);
  if (!batch) {
    res.status(404).json({ error: '批次不存在' });
    return;
  }
  res.json(buildArrivalView(batchId));
});

router.post('/:id/arrivals', (req, res) => {
  const batchId = Number(req.params.id);
  const body = (req.body ?? {}) as {
    planId?: number;
    date?: string;
    quantity?: number;
    unitPrice?: number | null;
    remark?: string;
  };
  const planId = Number(body.planId);
  const plan = db.prepare('SELECT id FROM plans WHERE id = ? AND batch_id = ?').get(planId, batchId);
  if (!plan) {
    res.status(400).json({ error: '预定记录不存在或不属于该批次' });
    return;
  }
  const quantity = Number(body.quantity ?? 0);
  if (!Number.isFinite(quantity) || quantity < 0) {
    res.status(400).json({ error: '实际到货数量不能为负数' });
    return;
  }
  const rawPrice = body.unitPrice;
  const unitPrice =
    rawPrice === undefined || rawPrice === null || rawPrice === ('' as unknown)
      ? null
      : Number(rawPrice);
  if (quantity > 0 && (unitPrice === null || !Number.isFinite(unitPrice) || unitPrice < 0)) {
    res.status(400).json({ error: '有实际到货数量时必须填写有效的实际单价' });
    return;
  }
  if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
    res.status(400).json({ error: '实际单价不能为负数' });
    return;
  }
  const amount = quantity > 0 && unitPrice !== null ? arrivalAmount(quantity, unitPrice) : 0;
  const now = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO arrival_records (batch_id, plan_id, date, quantity, unit_price, amount, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(batchId, planId, body.date ?? null, quantity, unitPrice, amount, body.remark ?? null, now, now);
  updateStatusAfterArrival(batchId);
  const record = db
    .prepare('SELECT * FROM arrival_records WHERE id = ?')
    .get(Number(info.lastInsertRowid));
  logAudit('arrival', Number(info.lastInsertRowid), 'create', null, record);
  res.status(201).json(record);
});

router.patch('/:id/arrivals/:arrivalId', (req, res) => {
  const batchId = Number(req.params.id);
  const arrivalId = Number(req.params.arrivalId);
  const record = db
    .prepare('SELECT * FROM arrival_records WHERE id = ? AND batch_id = ?')
    .get(arrivalId, batchId) as ArrivalRow | undefined;
  if (!record) {
    res.status(404).json({ error: '到货记录不存在' });
    return;
  }
  const body = (req.body ?? {}) as {
    date?: string;
    quantity?: number;
    unitPrice?: number | null;
    remark?: string;
  };
  const quantity = body.quantity !== undefined ? Number(body.quantity) : record.quantity;
  if (!Number.isFinite(quantity) || quantity < 0) {
    res.status(400).json({ error: '实际到货数量不能为负数' });
    return;
  }
  const rawPrice = body.unitPrice !== undefined ? body.unitPrice : record.unit_price;
  const unitPrice = rawPrice === null || rawPrice === ('' as unknown) ? null : Number(rawPrice);
  if (quantity > 0 && (unitPrice === null || !Number.isFinite(unitPrice) || unitPrice < 0)) {
    res.status(400).json({ error: '有实际到货数量时必须填写有效的实际单价' });
    return;
  }
  if (unitPrice !== null && (!Number.isFinite(unitPrice) || unitPrice < 0)) {
    res.status(400).json({ error: '实际单价不能为负数' });
    return;
  }
  const amount = quantity > 0 && unitPrice !== null ? arrivalAmount(quantity, unitPrice) : 0;
  db.prepare(
    'UPDATE arrival_records SET date = ?, quantity = ?, unit_price = ?, amount = ?, remark = ?, updated_at = ? WHERE id = ?'
  ).run(
    body.date ?? record.date,
    quantity,
    unitPrice,
    amount,
    body.remark ?? record.remark,
    new Date().toISOString(),
    arrivalId
  );
  updateStatusAfterArrival(batchId);
  const after = db.prepare('SELECT * FROM arrival_records WHERE id = ?').get(arrivalId);
  logAudit('arrival', arrivalId, 'update', record, after);
  res.json(after);
});

router.delete('/:id/arrivals/:arrivalId', (req, res) => {
  const batchId = Number(req.params.id);
  const arrivalId = Number(req.params.arrivalId);
  const before = db
    .prepare('SELECT * FROM arrival_records WHERE id = ? AND batch_id = ?')
    .get(arrivalId, batchId);
  db.prepare('DELETE FROM arrival_records WHERE id = ? AND batch_id = ?').run(arrivalId, batchId);
  updateStatusAfterArrival(batchId);
  if (before) logAudit('arrival', arrivalId, 'delete', before, null);
  res.status(204).end();
});

router.post('/:id/arrivals/confirm', (req, res) => {
  const batchId = Number(req.params.id);
  const batch = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId);
  if (!batch) {
    res.status(404).json({ error: '批次不存在' });
    return;
  }
  const planCount = (
    db.prepare('SELECT COUNT(*) AS c FROM plans WHERE batch_id = ?').get(batchId) as { c: number }
  ).c;
  if (planCount === 0) {
    res.status(400).json({ error: '请先维护预定产品清单' });
    return;
  }
  db.prepare('UPDATE batches SET status = ?, updated_at = ? WHERE id = ?').run(
    '经营中',
    new Date().toISOString(),
    batchId
  );
  const after = db.prepare('SELECT * FROM batches WHERE id = ?').get(batchId);
  logAudit('batch', batchId, 'confirm_arrival', batch, after);
  res.json(after);
});

export default router;
