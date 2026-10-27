import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { round2 } from '../calc.js';

const router = Router();

router.use(requireAuth);

interface Row {
  id: number;
  batch_id: number;
  batch_name: string;
  total_amount: number;
  status: string;
  confirmed_at: string | null;
  allocated_amount: number;
  paid_amount: number;
}

router.get('/', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT d.id, d.batch_id, b.name AS batch_name, d.total_amount, d.status, d.confirmed_at,
         COALESCE((SELECT SUM(a.share_amount) FROM dividend_allocations a WHERE a.dividend_id = d.id), 0) AS allocated_amount,
         COALESCE((SELECT SUM(p.amount) FROM dividend_payments p
                   JOIN dividend_allocations a2 ON a2.id = p.allocation_id
                   WHERE a2.dividend_id = d.id), 0) AS paid_amount
       FROM dividends d
       JOIN batches b ON b.id = d.batch_id
       WHERE b.status != '已归档'
       ORDER BY d.updated_at DESC`
    )
    .all() as Row[];

  res.json({
    dividends: rows.map((row) => ({
      ...row,
      allocated_amount: round2(row.allocated_amount),
      paid_amount: round2(row.paid_amount),
      unpaid_amount: Math.max(round2(row.allocated_amount - row.paid_amount), 0),
      unallocated_amount: Math.max(round2(row.total_amount - row.allocated_amount), 0),
    })),
  });
});

export default router;
