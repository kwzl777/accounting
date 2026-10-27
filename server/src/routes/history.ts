import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { debtStatus, remainingDebt, round2 } from '../calc.js';

const router = Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const query = req.query as Record<string, string | undefined>;

  const batchClauses: string[] = [];
  const batchParams: unknown[] = [];
  if (query.name) {
    batchClauses.push('name LIKE ?');
    batchParams.push(`%${query.name}%`);
  }
  if (query.status) {
    batchClauses.push('status = ?');
    batchParams.push(query.status);
  }
  if (query.dateFrom) {
    batchClauses.push('(date IS NOT NULL AND date >= ?)');
    batchParams.push(query.dateFrom);
  }
  if (query.dateTo) {
    batchClauses.push('(date IS NOT NULL AND date <= ?)');
    batchParams.push(query.dateTo);
  }
  const batchWhere = batchClauses.length ? `WHERE ${batchClauses.join(' AND ')}` : '';
  const batches = db
    .prepare(`SELECT * FROM batches ${batchWhere} ORDER BY date DESC, id DESC`)
    .all(...batchParams);

  const shipmentClauses: string[] = [];
  const shipmentParams: unknown[] = [];
  if (query.customer) {
    shipmentClauses.push('s.customer_name LIKE ?');
    shipmentParams.push(`%${query.customer}%`);
  }
  if (query.product) {
    shipmentClauses.push('s.product_name LIKE ?');
    shipmentParams.push(`%${query.product}%`);
  }
  if (query.flavor) {
    shipmentClauses.push('s.flavor LIKE ?');
    shipmentParams.push(`%${query.flavor}%`);
  }
  if (query.dateFrom) {
    shipmentClauses.push('(s.date IS NOT NULL AND s.date >= ?)');
    shipmentParams.push(query.dateFrom);
  }
  if (query.dateTo) {
    shipmentClauses.push('(s.date IS NOT NULL AND s.date <= ?)');
    shipmentParams.push(query.dateTo);
  }
  const shipmentWhere = shipmentClauses.length ? `WHERE ${shipmentClauses.join(' AND ')}` : '';
  const shipments = db
    .prepare(
      `SELECT s.*, b.name AS batch_name FROM shipments s
       JOIN batches b ON b.id = s.batch_id
       ${shipmentWhere}
       ORDER BY s.date DESC, s.id DESC`
    )
    .all(...shipmentParams) as Array<Record<string, any>>;

  const shipmentViews = shipments
    .map((shipment) => {
      const received = (
        db
          .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM receipts WHERE shipment_id = ?')
          .get(Number(shipment.id)) as { s: number }
      ).s;
      const remaining = remainingDebt(
        Number(shipment.sales_amount),
        Number(shipment.waived_amount),
        received
      );
      return {
        ...shipment,
        received_amount: round2(received),
        remaining_amount: remaining,
        status: debtStatus(
          Number(shipment.sales_amount),
          Number(shipment.waived_amount),
          received
        ),
      };
    })
    .filter((shipment) => !query.debtStatus || shipment.status === query.debtStatus);

  res.json({ batches, shipments: shipmentViews });
});

export default router;
