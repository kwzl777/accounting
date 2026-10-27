import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { exchangeLoss, round2 } from '../calc.js';
import { logAudit } from '../services/audit.js';

const router = Router();

router.use(requireAuth);

interface ExchangeRow {
  id: number;
  batch_id: number;
  date: string | null;
  rmb_amount: number;
  usd_amount: number;
  buy_rate: number | null;
  settle_rate: number | null;
  fee: number;
  include_fee: number;
  loss: number | null;
  remark: string | null;
}

function parseOptionalNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildExchangeView(batchId: number) {
  const exchanges = db
    .prepare('SELECT * FROM currency_exchanges WHERE batch_id = ? ORDER BY id')
    .all(batchId) as ExchangeRow[];
  let totalLoss = 0;
  const views = exchanges.map((exchange) => {
    // 按当前公式重算，保证历史记录展示与公式一致
    const loss = exchangeLoss({
      rmbAmount: exchange.rmb_amount,
      buyRate: exchange.buy_rate,
      sellRate: exchange.settle_rate,
    });
    if (loss !== null) totalLoss = round2(totalLoss + loss);
    return { ...exchange, loss };
  });
  return { exchanges: views, summary: { total_loss: totalLoss } };
}

router.get('/:id/exchanges', (req, res) => {
  const batchId = Number(req.params.id);
  const batch = db.prepare('SELECT id FROM batches WHERE id = ?').get(batchId);
  if (!batch) {
    res.status(404).json({ error: '批次不存在' });
    return;
  }
  res.json(buildExchangeView(batchId));
});

router.post('/:id/exchanges', (req, res) => {
  const batchId = Number(req.params.id);
  const body = (req.body ?? {}) as {
    date?: string;
    rmbAmount?: number;
    usdAmount?: number;
    buyRate?: number | null;
    settleRate?: number | null;
    fee?: number;
    includeFee?: boolean;
    remark?: string;
  };
  const rmbAmount = Number(body.rmbAmount ?? 0);
  const usdAmount = Number(body.usdAmount ?? 0);
  const fee = Number(body.fee ?? 0);
  const buyRate = parseOptionalNumber(body.buyRate);
  const settleRate = parseOptionalNumber(body.settleRate);
  if (!Number.isFinite(rmbAmount) || rmbAmount < 0) {
    res.status(400).json({ error: '人民币金额不能为负数' });
    return;
  }
  if (!Number.isFinite(usdAmount) || usdAmount < 0) {
    res.status(400).json({ error: 'U 币数量不能为负数' });
    return;
  }
  if (!Number.isFinite(fee) || fee < 0) {
    res.status(400).json({ error: '手续费不能为负数' });
    return;
  }
  if (buyRate !== null && buyRate <= 0) {
    res.status(400).json({ error: '买进汇率必须大于 0' });
    return;
  }
  if (settleRate !== null && settleRate < 0) {
    res.status(400).json({ error: '卖出汇率不能为负数' });
    return;
  }
  const loss = exchangeLoss({ rmbAmount, buyRate, sellRate: settleRate });
  const now = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO currency_exchanges (batch_id, date, rmb_amount, usd_amount, buy_rate, settle_rate, fee, include_fee, loss, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      batchId,
      body.date ?? null,
      rmbAmount,
      usdAmount,
      buyRate,
      settleRate,
      fee,
      0,
      loss,
      body.remark ?? null,
      now,
      now
    );
  const exchange = db
    .prepare('SELECT * FROM currency_exchanges WHERE id = ?')
    .get(Number(info.lastInsertRowid));
  logAudit('exchange', Number(info.lastInsertRowid), 'create', null, exchange);
  res.status(201).json(exchange);
});

router.patch('/:id/exchanges/:exchangeId', (req, res) => {
  const batchId = Number(req.params.id);
  const exchangeId = Number(req.params.exchangeId);
  const exchange = db
    .prepare('SELECT * FROM currency_exchanges WHERE id = ? AND batch_id = ?')
    .get(exchangeId, batchId) as ExchangeRow | undefined;
  if (!exchange) {
    res.status(404).json({ error: 'U 币兑换记录不存在' });
    return;
  }
  const body = (req.body ?? {}) as {
    date?: string;
    rmbAmount?: number;
    usdAmount?: number;
    buyRate?: number | null;
    settleRate?: number | null;
    fee?: number;
    includeFee?: boolean;
    remark?: string;
  };
  const rmbAmount = body.rmbAmount !== undefined ? Number(body.rmbAmount) : exchange.rmb_amount;
  const usdAmount = body.usdAmount !== undefined ? Number(body.usdAmount) : exchange.usd_amount;
  const fee = body.fee !== undefined ? Number(body.fee) : exchange.fee;
  const buyRate = body.buyRate !== undefined ? parseOptionalNumber(body.buyRate) : exchange.buy_rate;
  const settleRate =
    body.settleRate !== undefined ? parseOptionalNumber(body.settleRate) : exchange.settle_rate;
  if (!Number.isFinite(rmbAmount) || rmbAmount < 0) {
    res.status(400).json({ error: '人民币金额不能为负数' });
    return;
  }
  if (!Number.isFinite(usdAmount) || usdAmount < 0) {
    res.status(400).json({ error: 'U 币数量不能为负数' });
    return;
  }
  if (!Number.isFinite(fee) || fee < 0) {
    res.status(400).json({ error: '手续费不能为负数' });
    return;
  }
  if (buyRate !== null && buyRate <= 0) {
    res.status(400).json({ error: '买进汇率必须大于 0' });
    return;
  }
  if (settleRate !== null && settleRate < 0) {
    res.status(400).json({ error: '卖出汇率不能为负数' });
    return;
  }
  const loss = exchangeLoss({ rmbAmount, buyRate, sellRate: settleRate });
  db.prepare(
    'UPDATE currency_exchanges SET date = ?, rmb_amount = ?, usd_amount = ?, buy_rate = ?, settle_rate = ?, fee = ?, include_fee = ?, loss = ?, remark = ?, updated_at = ? WHERE id = ?'
  ).run(
    body.date ?? exchange.date,
    rmbAmount,
    usdAmount,
    buyRate,
    settleRate,
    fee,
    exchange.include_fee,
    loss,
    body.remark ?? exchange.remark,
    new Date().toISOString(),
    exchangeId
  );
  const after = db.prepare('SELECT * FROM currency_exchanges WHERE id = ?').get(exchangeId);
  logAudit('exchange', exchangeId, 'update', exchange, after);
  res.json(after);
});

router.delete('/:id/exchanges/:exchangeId', (req, res) => {
  const batchId = Number(req.params.id);
  const exchangeId = Number(req.params.exchangeId);
  const before = db
    .prepare('SELECT * FROM currency_exchanges WHERE id = ? AND batch_id = ?')
    .get(exchangeId, batchId);
  db.prepare('DELETE FROM currency_exchanges WHERE id = ? AND batch_id = ?').run(
    exchangeId,
    batchId
  );
  if (before) logAudit('exchange', exchangeId, 'delete', before, null);
  res.status(204).end();
});

export default router;
