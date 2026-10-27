import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { allocateShares, round2 } from '../calc.js';
import { logAudit } from '../services/audit.js';

const router = Router();

router.use(requireAuth);

interface DividendRow {
  id: number;
  batch_id: number;
  quantity: number;
  profit: number;
  total_amount: number;
  status: string;
  confirmed_at: string | null;
  created_at: string;
  updated_at: string;
}

interface AllocationRow {
  id: number;
  dividend_id: number;
  investor_name: string;
  contribution_amount: number;
  ratio: number;
  share_amount: number;
}

interface PaymentRow {
  id: number;
  allocation_id: number;
  date: string | null;
  amount: number;
  remark: string | null;
}

function getDividend(batchId: number): DividendRow | undefined {
  return db
    .prepare('SELECT * FROM dividends WHERE batch_id = ?')
    .get(batchId) as DividendRow | undefined;
}

function ensureDividend(batchId: number): DividendRow {
  let dividend = getDividend(batchId);
  if (!dividend) {
    const now = new Date().toISOString();
    db.prepare(
      'INSERT INTO dividends (batch_id, total_amount, status, created_at, updated_at) VALUES (?, 0, ?, ?, ?)'
    ).run(batchId, 'draft', now, now);
    dividend = getDividend(batchId) as DividendRow;
  }
  return dividend;
}

function recompute(dividendId: number, totalAmount: number): void {
  const allocations = db
    .prepare('SELECT * FROM dividend_allocations WHERE dividend_id = ? ORDER BY id')
    .all(dividendId) as AllocationRow[];
  const totalContribution = round2(
    allocations.reduce((sum, allocation) => sum + allocation.contribution_amount, 0)
  );
  const shares = allocateShares(
    totalAmount,
    allocations.map((allocation) => allocation.contribution_amount)
  );
  const now = new Date().toISOString();
  const update = db.prepare(
    'UPDATE dividend_allocations SET ratio = ?, share_amount = ?, updated_at = ? WHERE id = ?'
  );
  allocations.forEach((allocation, index) => {
    const ratio = totalContribution > 0 ? allocation.contribution_amount / totalContribution : 0;
    update.run(ratio, shares[index], now, allocation.id);
  });
}

function buildView(batchId: number) {
  const dividend = ensureDividend(batchId);
  const allocations = db
    .prepare('SELECT * FROM dividend_allocations WHERE dividend_id = ? ORDER BY id')
    .all(dividend.id) as AllocationRow[];
  const payments = db
    .prepare(
      `SELECT p.* FROM dividend_payments p
       JOIN dividend_allocations a ON a.id = p.allocation_id
       WHERE a.dividend_id = ?
       ORDER BY p.id`
    )
    .all(dividend.id) as PaymentRow[];

  const paymentMap = new Map<number, PaymentRow[]>();
  for (const payment of payments) {
    const list = paymentMap.get(payment.allocation_id) ?? [];
    list.push(payment);
    paymentMap.set(payment.allocation_id, list);
  }

  const allocationViews = allocations.map((allocation) => {
    const list = paymentMap.get(allocation.id) ?? [];
    const paid = round2(list.reduce((sum, payment) => sum + payment.amount, 0));
    return {
      ...allocation,
      paid_amount: paid,
      unpaid_amount: Math.max(round2(allocation.share_amount - paid), 0),
      payments: list,
    };
  });

  const allocatedAmount = round2(
    allocationViews.reduce((sum, allocation) => sum + allocation.share_amount, 0)
  );
  const paidAmount = round2(
    allocationViews.reduce((sum, allocation) => sum + allocation.paid_amount, 0)
  );
  const unpaidAmount = round2(
    allocationViews.reduce((sum, allocation) => sum + allocation.unpaid_amount, 0)
  );

  return {
    dividend,
    allocations: allocationViews,
    summary: {
      total_amount: dividend.total_amount,
      allocated_amount: allocatedAmount,
      unallocated_amount: Math.max(round2(dividend.total_amount - allocatedAmount), 0),
      paid_amount: paidAmount,
      unpaid_amount: unpaidAmount,
    },
  };
}

router.get('/:id/dividend', (req, res) => {
  const batchId = Number(req.params.id);
  const batch = db.prepare('SELECT id FROM batches WHERE id = ?').get(batchId);
  if (!batch) {
    res.status(404).json({ error: '批次不存在' });
    return;
  }
  res.json(buildView(batchId));
});

router.put('/:id/dividend', (req, res) => {
  const batchId = Number(req.params.id);
  const dividend = ensureDividend(batchId);
  if (dividend.status === 'confirmed') {
    res.status(400).json({ error: '分红已确认，不能修改分红总额' });
    return;
  }
  const body = (req.body ?? {}) as { quantity?: number; profit?: number };
  const quantity = Number(body.quantity ?? 0);
  const profit = Number(body.profit ?? 0);
  if (!Number.isFinite(quantity) || quantity < 0) {
    res.status(400).json({ error: '数量不能为负数' });
    return;
  }
  if (!Number.isFinite(profit)) {
    res.status(400).json({ error: '请输入正确的利润' });
    return;
  }
  const totalAmount = round2(Math.max(quantity * profit * 0.3, 0));
  const now = new Date().toISOString();
  db.prepare(
    'UPDATE dividends SET quantity = ?, profit = ?, total_amount = ?, updated_at = ? WHERE id = ?'
  ).run(round2(quantity), round2(profit), totalAmount, now, dividend.id);
  recompute(dividend.id, totalAmount);
  const afterDividend = db.prepare('SELECT * FROM dividends WHERE id = ?').get(dividend.id);
  logAudit('dividend', dividend.id, 'update_amount', dividend, afterDividend);
  res.json(buildView(batchId));
});

router.post('/:id/dividend/allocations', (req, res) => {
  const batchId = Number(req.params.id);
  const dividend = ensureDividend(batchId);
  if (dividend.status === 'confirmed') {
    res.status(400).json({ error: '分红已确认，不能修改出资记录' });
    return;
  }
  const body = (req.body ?? {}) as { investorName?: string; amount?: number };
  const investorName = typeof body.investorName === 'string' ? body.investorName.trim() : '';
  const amount = Number(body.amount ?? 0);
  if (!investorName) {
    res.status(400).json({ error: '出资人姓名不能为空' });
    return;
  }
  if (!Number.isFinite(amount) || amount < 0) {
    res.status(400).json({ error: '出资金额不能为负数' });
    return;
  }
  const now = new Date().toISOString();
  const info = db.prepare(
    'INSERT INTO dividend_allocations (dividend_id, investor_name, contribution_amount, ratio, share_amount, created_at, updated_at) VALUES (?, ?, ?, 0, 0, ?, ?)'
  ).run(dividend.id, investorName, round2(amount), now, now);
  recompute(dividend.id, dividend.total_amount);
  const created = db
    .prepare('SELECT * FROM dividend_allocations WHERE id = ?')
    .get(Number(info.lastInsertRowid));
  logAudit('allocation', Number(info.lastInsertRowid), 'create', null, created);
  res.status(201).json(buildView(batchId));
});

router.patch('/:id/dividend/allocations/:allocationId', (req, res) => {
  const batchId = Number(req.params.id);
  const dividend = ensureDividend(batchId);
  if (dividend.status === 'confirmed') {
    res.status(400).json({ error: '分红已确认，不能修改出资记录' });
    return;
  }
  const allocationId = Number(req.params.allocationId);
  const allocation = db
    .prepare('SELECT * FROM dividend_allocations WHERE id = ? AND dividend_id = ?')
    .get(allocationId, dividend.id) as AllocationRow | undefined;
  if (!allocation) {
    res.status(404).json({ error: '出资记录不存在' });
    return;
  }
  const body = (req.body ?? {}) as { investorName?: string; amount?: number };
  const investorName =
    body.investorName !== undefined ? String(body.investorName).trim() : allocation.investor_name;
  const amount = body.amount !== undefined ? Number(body.amount) : allocation.contribution_amount;
  if (!investorName) {
    res.status(400).json({ error: '出资人姓名不能为空' });
    return;
  }
  if (!Number.isFinite(amount) || amount < 0) {
    res.status(400).json({ error: '出资金额不能为负数' });
    return;
  }
  db.prepare(
    'UPDATE dividend_allocations SET investor_name = ?, contribution_amount = ?, updated_at = ? WHERE id = ?'
  ).run(investorName, round2(amount), new Date().toISOString(), allocationId);
  recompute(dividend.id, dividend.total_amount);
  const after = db
    .prepare('SELECT * FROM dividend_allocations WHERE id = ?')
    .get(allocationId);
  logAudit('allocation', allocationId, 'update', allocation, after);
  res.json(buildView(batchId));
});

router.delete('/:id/dividend/allocations/:allocationId', (req, res) => {
  const batchId = Number(req.params.id);
  const dividend = ensureDividend(batchId);
  if (dividend.status === 'confirmed') {
    res.status(400).json({ error: '分红已确认，不能修改出资记录' });
    return;
  }
  const allocationId = Number(req.params.allocationId);
  const before = db
    .prepare('SELECT * FROM dividend_allocations WHERE id = ? AND dividend_id = ?')
    .get(allocationId, dividend.id);
  db.prepare('DELETE FROM dividend_payments WHERE allocation_id = ?').run(allocationId);
  db.prepare('DELETE FROM dividend_allocations WHERE id = ? AND dividend_id = ?').run(
    allocationId,
    dividend.id
  );
  recompute(dividend.id, dividend.total_amount);
  if (before) logAudit('allocation', allocationId, 'delete', before, null);
  res.status(204).end();
});

router.post('/:id/dividend/confirm', (req, res) => {
  const batchId = Number(req.params.id);
  const dividend = ensureDividend(batchId);
  if (dividend.status === 'confirmed') {
    res.status(400).json({ error: '分红已确认，不能重复确认' });
    return;
  }
  const allocations = db
    .prepare('SELECT * FROM dividend_allocations WHERE dividend_id = ?')
    .all(dividend.id) as AllocationRow[];
  if (allocations.length === 0) {
    res.status(400).json({ error: '请先添加出资人记录' });
    return;
  }
  const totalContribution = round2(
    allocations.reduce((sum, allocation) => sum + allocation.contribution_amount, 0)
  );
  if (totalContribution <= 0) {
    res.status(400).json({ error: '出资总额为 0，无法计算和确认分红' });
    return;
  }
  if (dividend.total_amount <= 0) {
    res.status(400).json({ error: '请先填写分红总额' });
    return;
  }
  recompute(dividend.id, dividend.total_amount);
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE dividends SET status = 'confirmed', confirmed_at = ?, updated_at = ? WHERE id = ?"
  ).run(now, now, dividend.id);
  const after = db.prepare('SELECT * FROM dividends WHERE id = ?').get(dividend.id);
  logAudit('dividend', dividend.id, 'confirm', dividend, after);
  res.json(buildView(batchId));
});

router.post('/:id/dividend/allocations/:allocationId/payments', (req, res) => {
  const batchId = Number(req.params.id);
  const dividend = getDividend(batchId);
  if (!dividend || dividend.status !== 'confirmed') {
    res.status(400).json({ error: '请先确认分红后再登记兑付' });
    return;
  }
  const allocationId = Number(req.params.allocationId);
  const allocation = db
    .prepare('SELECT * FROM dividend_allocations WHERE id = ? AND dividend_id = ?')
    .get(allocationId, dividend.id) as AllocationRow | undefined;
  if (!allocation) {
    res.status(404).json({ error: '出资记录不存在' });
    return;
  }
  const body = (req.body ?? {}) as { date?: string; amount?: number; remark?: string };
  const amount = Number(body.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: '兑付金额必须大于 0' });
    return;
  }
  const paid = (
    db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM dividend_payments WHERE allocation_id = ?')
      .get(allocationId) as { s: number }
  ).s;
  const unpaid = Math.max(round2(allocation.share_amount - paid), 0);
  if (unpaid <= 0) {
    res.status(400).json({ error: '该出资人应分金额已兑付完毕' });
    return;
  }
  if (amount > unpaid) {
    res.status(400).json({ error: `兑付金额超过未兑付余额（未兑付 ${unpaid}）` });
    return;
  }
  const now = new Date().toISOString();
  const info = db.prepare(
    'INSERT INTO dividend_payments (allocation_id, date, amount, remark, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(allocationId, body.date ?? null, amount, body.remark ?? null, now);
  const created = db
    .prepare('SELECT * FROM dividend_payments WHERE id = ?')
    .get(Number(info.lastInsertRowid));
  logAudit('dividend_payment', Number(info.lastInsertRowid), 'create', null, created);
  res.status(201).json(buildView(batchId));
});

router.delete('/:id/dividend/payments/:paymentId', (req, res) => {
  const batchId = Number(req.params.id);
  const dividend = getDividend(batchId);
  if (!dividend) {
    res.status(404).json({ error: '分红记录不存在' });
    return;
  }
  const paymentId = Number(req.params.paymentId);
  const payment = db
    .prepare(
      `SELECT p.* FROM dividend_payments p
       JOIN dividend_allocations a ON a.id = p.allocation_id
       WHERE p.id = ? AND a.dividend_id = ?`
    )
    .get(paymentId, dividend.id) as PaymentRow | undefined;
  if (!payment) {
    res.status(404).json({ error: '兑付记录不存在' });
    return;
  }
  db.prepare('DELETE FROM dividend_payments WHERE id = ?').run(paymentId);
  logAudit('dividend_payment', paymentId, 'delete', payment, null);
  res.status(204).end();
});

interface DividendRecordRow {
  id: number;
  batch_id: number;
  batch_name: string;
  batch_code: string;
  amount: number;
  status: 'paid' | 'unpaid';
  created_at: string;
  updated_at: string;
}

router.get('/:id/dividend/records', (req, res) => {
  const batchId = Number(req.params.id);
  const batch = db.prepare('SELECT id FROM batches WHERE id = ?').get(batchId);
  if (!batch) {
    res.status(404).json({ error: '批次不存在' });
    return;
  }
  const records = db
    .prepare('SELECT * FROM dividend_records WHERE batch_id = ? ORDER BY id DESC')
    .all(batchId) as DividendRecordRow[];
  res.json({ records });
});

router.post('/:id/dividend/records', (req, res) => {
  const batchId = Number(req.params.id);
  const batch = db
    .prepare('SELECT id, name FROM batches WHERE id = ?')
    .get(batchId) as { id: number; name: string } | undefined;
  if (!batch) {
    res.status(404).json({ error: '批次不存在' });
    return;
  }
  const dividend = ensureDividend(batchId);
  const allocations = db
    .prepare('SELECT investor_name, share_amount FROM dividend_allocations WHERE dividend_id = ?')
    .all(dividend.id) as Array<{ investor_name: string; share_amount: number }>;
  const amount = round2(
    allocations
      .filter((allocation) => allocation.investor_name !== '公')
      .reduce((sum, allocation) => sum + Number(allocation.share_amount), 0)
  );
  const now = new Date().toISOString();
  const batchCode =
    typeof (req.body ?? {}).batchCode === 'string'
      ? String((req.body ?? {}).batchCode).trim()
      : '';
  const info = db
    .prepare(
      'INSERT INTO dividend_records (batch_id, batch_name, batch_code, amount, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(batchId, batch.name, batchCode, amount, 'unpaid', now, now);
  const record = db
    .prepare('SELECT * FROM dividend_records WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as DividendRecordRow;
  logAudit('dividend_record', record.id, 'create', null, record);
  res.status(201).json({ record });
});

router.patch('/:id/dividend/records/:recordId', (req, res) => {
  const batchId = Number(req.params.id);
  const recordId = Number(req.params.recordId);
  const record = db
    .prepare('SELECT * FROM dividend_records WHERE id = ? AND batch_id = ?')
    .get(recordId, batchId) as DividendRecordRow | undefined;
  if (!record) {
    res.status(404).json({ error: '分红明细不存在' });
    return;
  }
  const status = (req.body ?? {}).status;
  if (status !== 'paid' && status !== 'unpaid') {
    res.status(400).json({ error: '状态只能为已支付或未支付' });
    return;
  }
  const now = new Date().toISOString();
  db.prepare('UPDATE dividend_records SET status = ?, updated_at = ? WHERE id = ?').run(
    status,
    now,
    recordId
  );
  const after = db.prepare('SELECT * FROM dividend_records WHERE id = ?').get(recordId);
  logAudit('dividend_record', recordId, 'update_status', record, after);
  res.json({ record: after });
});

router.delete('/:id/dividend/records/:recordId', (req, res) => {
  const batchId = Number(req.params.id);
  const recordId = Number(req.params.recordId);
  const record = db
    .prepare('SELECT * FROM dividend_records WHERE id = ? AND batch_id = ?')
    .get(recordId, batchId) as DividendRecordRow | undefined;
  if (!record) {
    res.status(404).json({ error: '分红明细不存在' });
    return;
  }
  db.prepare('DELETE FROM dividend_records WHERE id = ?').run(recordId);
  logAudit('dividend_record', recordId, 'delete', record, null);
  res.status(204).end();
});

export default router;
