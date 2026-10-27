import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { round2 } from '../calc.js';
import { logAudit } from '../services/audit.js';

const router = Router();

router.use(requireAuth);

interface ExpenseRow {
  id: number;
  batch_id: number;
  date: string | null;
  category: string;
  amount: number;
  description: string | null;
  voucher_url: string | null;
}

function buildExpenseView(batchId: number) {
  const expenses = db
    .prepare('SELECT * FROM expenses WHERE batch_id = ? ORDER BY id')
    .all(batchId) as ExpenseRow[];
  const byCategory = new Map<string, number>();
  let total = 0;
  for (const expense of expenses) {
    byCategory.set(expense.category, round2((byCategory.get(expense.category) ?? 0) + expense.amount));
    total = round2(total + expense.amount);
  }
  return {
    expenses,
    summary: {
      total,
      by_category: [...byCategory.entries()]
        .map(([category, amount]) => ({ category, amount }))
        .sort((a, b) => b.amount - a.amount),
    },
  };
}

function ensureCategory(name: string, now: string) {
  db.prepare(
    'INSERT OR IGNORE INTO expense_categories (name, is_default, created_at) VALUES (?, 0, ?)'
  ).run(name, now);
}

router.get('/:id/expenses', (req, res) => {
  const batchId = Number(req.params.id);
  const batch = db.prepare('SELECT id FROM batches WHERE id = ?').get(batchId);
  if (!batch) {
    res.status(404).json({ error: '批次不存在' });
    return;
  }
  res.json(buildExpenseView(batchId));
});

router.post('/:id/expenses', (req, res) => {
  const batchId = Number(req.params.id);
  const body = (req.body ?? {}) as {
    date?: string;
    category?: string;
    amount?: number;
    description?: string;
    voucherUrl?: string;
  };
  const category = typeof body.category === 'string' ? body.category.trim() : '';
  if (!category) {
    res.status(400).json({ error: '费用类别不能为空' });
    return;
  }
  const amount = Number(body.amount ?? 0);
  if (!Number.isFinite(amount) || amount < 0) {
    res.status(400).json({ error: '费用金额不能为负数' });
    return;
  }
  const now = new Date().toISOString();
  ensureCategory(category, now);
  const info = db
    .prepare(
      'INSERT INTO expenses (batch_id, date, category, amount, description, voucher_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      batchId,
      body.date ?? null,
      category,
      amount,
      body.description ?? null,
      body.voucherUrl ?? null,
      now,
      now
    );
  const expense = db.prepare('SELECT * FROM expenses WHERE id = ?').get(Number(info.lastInsertRowid));
  logAudit('expense', Number(info.lastInsertRowid), 'create', null, expense);
  res.status(201).json(expense);
});

router.patch('/:id/expenses/:expenseId', (req, res) => {
  const batchId = Number(req.params.id);
  const expenseId = Number(req.params.expenseId);
  const expense = db
    .prepare('SELECT * FROM expenses WHERE id = ? AND batch_id = ?')
    .get(expenseId, batchId) as ExpenseRow | undefined;
  if (!expense) {
    res.status(404).json({ error: '费用记录不存在' });
    return;
  }
  const body = (req.body ?? {}) as {
    date?: string;
    category?: string;
    amount?: number;
    description?: string;
    voucherUrl?: string;
  };
  const category =
    body.category !== undefined ? String(body.category).trim() : expense.category;
  if (!category) {
    res.status(400).json({ error: '费用类别不能为空' });
    return;
  }
  const amount = body.amount !== undefined ? Number(body.amount) : expense.amount;
  if (!Number.isFinite(amount) || amount < 0) {
    res.status(400).json({ error: '费用金额不能为负数' });
    return;
  }
  const now = new Date().toISOString();
  ensureCategory(category, now);
  db.prepare(
    'UPDATE expenses SET date = ?, category = ?, amount = ?, description = ?, voucher_url = ?, updated_at = ? WHERE id = ?'
  ).run(
    body.date ?? expense.date,
    category,
    amount,
    body.description ?? expense.description,
    body.voucherUrl ?? expense.voucher_url,
    now,
    expenseId
  );
  const after = db.prepare('SELECT * FROM expenses WHERE id = ?').get(expenseId);
  logAudit('expense', expenseId, 'update', expense, after);
  res.json(after);
});

router.delete('/:id/expenses/:expenseId', (req, res) => {
  const batchId = Number(req.params.id);
  const expenseId = Number(req.params.expenseId);
  const before = db
    .prepare('SELECT * FROM expenses WHERE id = ? AND batch_id = ?')
    .get(expenseId, batchId);
  db.prepare('DELETE FROM expenses WHERE id = ? AND batch_id = ?').run(expenseId, batchId);
  if (before) logAudit('expense', expenseId, 'delete', before, null);
  res.status(204).end();
});

export default router;
