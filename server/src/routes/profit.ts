import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { batchProfit, round2 } from '../calc.js';
import { getBatchFinancials, getBatchReceivable } from '../services/financials.js';

const router = Router();

router.use(requireAuth);

router.get('/:id/profit', (req, res) => {
  const batchId = Number(req.params.id);
  const batch = db
    .prepare('SELECT id, manual_dividend FROM batches WHERE id = ?')
    .get(batchId) as { id: number; manual_dividend: number } | undefined;
  if (!batch) {
    res.status(404).json({ error: '批次不存在' });
    return;
  }

  const financials = getBatchFinancials(batchId);
  const settledAmount = round2(financials.receivedAmount + financials.waivedAmount);
  const profit = batchProfit({
    basis: 'cash',
    salesAmount: financials.salesAmount,
    receivedAmount: settledAmount,
    actualCost: financials.actualCost,
    expenses: financials.expenses,
  });

  res.json({
    batch_id: batchId,
    basis: 'cash',
    sales_amount: financials.salesAmount,
    received_amount: financials.receivedAmount,
    waived_amount: financials.waivedAmount,
    settled_amount: settledAmount,
    receivable_remaining: getBatchReceivable(batchId),
    actual_cost: financials.actualCost,
    expenses: financials.expenses,
    exchange_loss: financials.exchangeLoss,
    manual_dividend: round2(Number(batch.manual_dividend) || 0),
    profit,
  });
});

router.put('/:id/profit-dividend', (req, res) => {
  const batchId = Number(req.params.id);
  const batch = db.prepare('SELECT id FROM batches WHERE id = ?').get(batchId);
  if (!batch) {
    res.status(404).json({ error: '批次不存在' });
    return;
  }
  const amount = Number((req.body ?? {}).amount ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    res.status(400).json({ error: '分红金额不能为负数' });
    return;
  }
  const now = new Date().toISOString();
  db.prepare(
    'UPDATE batches SET manual_dividend = ?, updated_at = ? WHERE id = ?'
  ).run(round2(amount), now, batchId);
  res.json({ manual_dividend: round2(amount) });
});

export default router;
