import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { batchProfit, round2 } from '../calc.js';
import {
  getBatchFinancials,
  getBatchReceivable,
  getProfitBasis,
  sumOf,
} from '../services/financials.js';

const router = Router();

router.use(requireAuth);

interface BatchRow {
  id: number;
  name: string;
  date: string | null;
  status: string;
}

interface DividendRow {
  id: number;
  total_amount: number;
  status: string;
}

router.get('/', (_req, res) => {
  const basis = getProfitBasis();
  const batches = db
    .prepare(
      "SELECT id, name, date, status FROM batches WHERE status != '已归档' ORDER BY updated_at DESC"
    )
    .all() as BatchRow[];

  let cumulativeProfit = 0;
  let totalDividends = 0;
  let totalReceivable = 0;

  const batchRows = batches.map((batch) => {
    const financials = getBatchFinancials(batch.id);
    const settledAmount = round2(
      financials.receivedAmount + financials.waivedAmount
    );
    const profit = batchProfit({
      basis: 'cash',
      salesAmount: financials.salesAmount,
      receivedAmount: settledAmount,
      actualCost: financials.actualCost,
      expenses: financials.expenses,
    });

    const dividend = db
      .prepare('SELECT id, total_amount, status FROM dividends WHERE batch_id = ?')
      .get(batch.id) as DividendRow | undefined;
    const confirmedDividend =
      dividend && dividend.status === 'confirmed' ? round2(dividend.total_amount) : 0;

    cumulativeProfit = round2(cumulativeProfit + profit - confirmedDividend);
    totalDividends = round2(totalDividends + confirmedDividend);

    const remaining = getBatchReceivable(batch.id);
    totalReceivable = round2(totalReceivable + remaining);

    const pending: string[] = [];
    const shortage = (
      db
        .prepare(
          `SELECT COUNT(*) AS c FROM plans p
           WHERE p.batch_id = ?
             AND (SELECT COALESCE(SUM(a.quantity), 0) FROM arrival_records a WHERE a.plan_id = p.id) < p.quantity`
        )
        .get(batch.id) as { c: number }
    ).c;
    if (shortage > 0) pending.push('有缺货');
    if (remaining > 0) pending.push('有欠款');
    if (dividend && dividend.status === 'draft' && dividend.total_amount > 0) {
      pending.push('分红待确认');
    }
    if (dividend && dividend.status === 'confirmed') {
      const unpaid = (
        db
          .prepare(
            `SELECT
               COALESCE((SELECT SUM(a.share_amount) FROM dividend_allocations a WHERE a.dividend_id = ?), 0)
               - COALESCE((SELECT SUM(p.amount) FROM dividend_payments p
                           JOIN dividend_allocations a2 ON a2.id = p.allocation_id
                           WHERE a2.dividend_id = ?), 0) AS s`
          )
          .get(dividend.id, dividend.id) as { s: number }
      ).s;
      if (round2(unpaid) > 0) pending.push('分红待兑付');
    }
    if (batch.status === '到货完成') pending.push('待确认到货');

    return {
      id: batch.id,
      name: batch.name,
      date: batch.date,
      status: batch.status,
      planned_total: sumOf(batch.id, 'plans', 'amount'),
      arrival_total: financials.actualCost,
      shipment_received: settledAmount,
      profit,
      receivable: remaining,
      pending,
    };
  });

  const allocated = (
    db
      .prepare(
        `SELECT COALESCE(SUM(a.share_amount), 0) AS s
         FROM dividend_allocations a
         JOIN dividends d ON d.id = a.dividend_id
         JOIN batches b ON b.id = d.batch_id
         WHERE d.status = 'confirmed' AND b.status != '已归档'`
      )
      .get() as { s: number }
  ).s;

  const generalExpenseTotal = (
    db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM general_expenses')
      .get() as { s: number }
  ).s;
  cumulativeProfit = round2(cumulativeProfit - generalExpenseTotal);

  res.json({
    basis,
    metrics: {
      cumulative_profit: cumulativeProfit,
      total_dividends: totalDividends,
      allocated_dividends: round2(allocated),
      unallocated_dividends: Math.max(round2(totalDividends - allocated), 0),
      total_receivable: totalReceivable,
    },
    batches: batchRows,
  });
});

router.post('/expenses', (req, res) => {
  const body = (req.body ?? {}) as {
    reason?: string;
    amount?: number;
    date?: string;
  };
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const amount = Number(body.amount ?? 0);
  if (!reason) {
    res.status(400).json({ error: '请填写支出事由' });
    return;
  }
  if (!Number.isFinite(amount) || amount === 0) {
    res.status(400).json({ error: '支出金额不能为 0' });
    return;
  }
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const date =
    typeof body.date === 'string' && body.date.trim()
      ? body.date.trim()
      : `${now.getFullYear()}-${month}-${day}`;
  const info = db
    .prepare(
      'INSERT INTO general_expenses (date, reason, amount, created_at) VALUES (?, ?, ?, ?)'
    )
    .run(date, reason, round2(amount), new Date().toISOString());
  const expense = db
    .prepare('SELECT * FROM general_expenses WHERE id = ?')
    .get(Number(info.lastInsertRowid));
  res.status(201).json({ expense });
});

router.get('/profit-detail', (_req, res) => {
  const batches = db
    .prepare(
      "SELECT id, name, date FROM batches WHERE status != '已归档' ORDER BY date, id"
    )
    .all() as Array<{ id: number; name: string; date: string | null }>;
  const dates = batches
    .map((batch) => batch.date)
    .filter((date): date is string => Boolean(date))
    .sort();
  const period = {
    from: dates[0] ?? null,
    to: dates[dates.length - 1] ?? null,
  };

  const incomeRows = db
    .prepare(
      `SELECT s.id, s.batch_id, b.name AS batch_name, s.customer_name,
              COALESCE(s.date, b.date) AS date, s.product_name, s.flavor,
              s.waived_amount, COALESCE(r.received, 0) AS received
       FROM shipments s
       JOIN batches b ON b.id = s.batch_id
       LEFT JOIN (
         SELECT shipment_id, SUM(amount) AS received
         FROM receipts
         GROUP BY shipment_id
       ) r ON r.shipment_id = s.id
       WHERE b.status != '已归档'
       ORDER BY s.batch_id, s.id`
    )
    .all() as Array<{
    id: number;
    batch_id: number;
    batch_name: string;
    customer_name: string;
    date: string | null;
    product_name: string | null;
    flavor: string | null;
    received: number;
    waived_amount: number;
  }>;

  const costRows = db
    .prepare(
      `SELECT ps.id, ps.batch_id, b.name AS batch_name, ps.product_name,
              ps.ship_date, ps.total_quantity, ps.unit_price, ps.freight,
              ps.exchange_loss, ps.cost_amount
       FROM product_shipments ps
       JOIN batches b ON b.id = ps.batch_id
       WHERE b.status != '已归档'
       ORDER BY ps.ship_date, ps.id`
    )
    .all() as Array<{
    id: number;
    batch_id: number;
    batch_name: string;
    product_name: string;
    ship_date: string;
    total_quantity: number;
    unit_price: number;
    freight: number;
    exchange_loss: number | null;
    cost_amount: number;
  }>;

  const expenseRows = db
    .prepare(
      `SELECT e.id, e.batch_id, b.name AS batch_name, e.date, e.category,
              e.amount, e.description
       FROM expenses e
       JOIN batches b ON b.id = e.batch_id
       WHERE b.status != '已归档'
       ORDER BY e.date, e.id`
    )
    .all() as Array<{
    id: number;
    batch_id: number;
    batch_name: string;
    date: string | null;
    category: string;
    amount: number;
    description: string | null;
  }>;

  const dividendRows = db
    .prepare(
      `SELECT d.id, d.batch_id, b.name AS batch_name, d.total_amount, d.confirmed_at
       FROM dividends d
       JOIN batches b ON b.id = d.batch_id
       WHERE d.status = 'confirmed' AND b.status != '已归档'
       ORDER BY d.confirmed_at, d.id`
    )
    .all() as Array<{
    id: number;
    batch_id: number;
    batch_name: string;
    total_amount: number;
    confirmed_at: string | null;
  }>;

  const generalExpenseRows = db
    .prepare(
      `SELECT id, date, reason, amount, created_at
       FROM general_expenses
       ORDER BY date, id`
    )
    .all() as Array<{
    id: number;
    date: string | null;
    reason: string;
    amount: number;
    created_at: string;
  }>;

  const income = incomeRows
    .map((row) => ({
      id: row.id,
      batch_id: row.batch_id,
      batch_name: row.batch_name,
      customer_name: row.customer_name,
      date: row.date,
      product_name: row.product_name,
      flavor: row.flavor,
      received: round2(row.received),
      waived: round2(row.waived_amount),
      amount: round2(Number(row.received) + Number(row.waived_amount)),
    }))
    .filter((row) => row.amount > 0);
  const costs = costRows.map((row) => ({
    ...row,
    cost_amount: round2(row.cost_amount),
  }));
  const expenses = expenseRows.map((row) => ({
    ...row,
    amount: round2(row.amount),
  }));
  const dividends = dividendRows.map((row) => ({
    ...row,
    total_amount: round2(row.total_amount),
  }));

  const incomeTotal = round2(
    income.reduce((sum, row) => sum + row.amount, 0)
  );
  const costTotal = round2(
    costs.reduce((sum, row) => sum + row.cost_amount, 0)
  );
  const expenseTotal = round2(
    expenses.reduce((sum, row) => sum + row.amount, 0)
  );
  const dividendTotal = round2(
    dividends.reduce((sum, row) => sum + row.total_amount, 0)
  );
  const generalExpenses = generalExpenseRows.map((row) => ({
    ...row,
    amount: round2(row.amount),
  }));
  const generalExpenseTotal = round2(
    generalExpenses.reduce((sum, row) => sum + row.amount, 0)
  );

  const batchSummaries = batches
    .map((batch) => {
      const batchCosts = costs.filter((row) => row.batch_id === batch.id);
      const latestCost = batchCosts.length > 0 ? batchCosts[batchCosts.length - 1] : null;
      const incomeAmount = round2(
        income
          .filter((row) => row.batch_id === batch.id)
          .reduce((sum, row) => sum + row.amount, 0)
      );
      const costAmount = round2(
        batchCosts.reduce((sum, row) => sum + row.cost_amount, 0)
      );
      const expenseAmount = round2(
        expenses
          .filter((row) => row.batch_id === batch.id)
          .reduce((sum, row) => sum + row.amount, 0)
      );
      const dividendAmount = round2(
        dividends
          .filter((row) => row.batch_id === batch.id)
          .reduce((sum, row) => sum + row.total_amount, 0)
      );
      return {
        id: batch.id,
        name: batch.name,
        date: batch.date,
        product_name:
          latestCost?.product_name ||
          batch.name.replace(/\s*\d{4}-\d{2}-\d{2}.*$/, ''),
        ship_date: latestCost?.ship_date || batch.date || '',
        quantity: round2(latestCost?.total_quantity ?? 0),
        income: incomeAmount,
        cost: costAmount,
        expenses: expenseAmount,
        dividends: dividendAmount,
        profit: round2(incomeAmount - costAmount - expenseAmount - dividendAmount),
      };
    })
    .filter(
      (batch) =>
        batch.income !== 0 ||
        batch.cost !== 0 ||
        batch.expenses !== 0 ||
        batch.dividends !== 0
    );

  res.json({
    period,
    totals: {
      income: incomeTotal,
      cost: costTotal,
      expenses: expenseTotal,
      dividends: dividendTotal,
      general_expenses: generalExpenseTotal,
      profit: round2(
        incomeTotal -
          costTotal -
          expenseTotal -
          dividendTotal -
          generalExpenseTotal
      ),
    },
    batches: batchSummaries,
    generalExpenses,
    incomeSources: income,
    costSources: costs,
    expenseSources: expenses,
    dividendSources: dividends,
  });
});

export default router;
