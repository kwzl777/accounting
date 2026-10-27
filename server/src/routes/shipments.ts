import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { salesAmount, remainingDebt, debtStatus, round2 } from '../calc.js';
import { logAudit } from '../services/audit.js';

const router = Router();

router.use(requireAuth);

interface ShipmentRow {
  id: number;
  batch_id: number;
  plan_id: number | null;
  customer_name: string;
  date: string | null;
  product_name: string | null;
  flavor: string | null;
  quantity: number;
  unit_price: number;
  sales_amount: number;
  waived_amount: number;
  remark: string | null;
}

interface ReceiptRow {
  id: number;
  batch_id: number;
  shipment_id: number;
  date: string | null;
  amount: number;
  remark: string | null;
}

function loadReceipts(batchId: number): Map<number, ReceiptRow[]> {
  const receipts = db
    .prepare('SELECT * FROM receipts WHERE batch_id = ? ORDER BY id')
    .all(batchId) as ReceiptRow[];
  const map = new Map<number, ReceiptRow[]>();
  for (const receipt of receipts) {
    const list = map.get(receipt.shipment_id) ?? [];
    list.push(receipt);
    map.set(receipt.shipment_id, list);
  }
  return map;
}

interface PlanStockRow {
  plan_id: number;
  product_name: string;
  flavor: string;
  stock: number;
  planned_quantity: number;
  planned_unit_price: number;
  actual_quantity: number;
  shipped_quantity: number;
  remaining_quantity: number;
  bookings: Array<{
    booking_id: number;
    customer_name: string;
    quantity: number;
    allocated_quantity: number;
  }>;
}

function parsePlanId(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function loadPlanStock(batchId: number): PlanStockRow[] {
  const plans = db
    .prepare(
      'SELECT id, product_name, flavor, quantity, unit_price FROM plans WHERE batch_id = ? ORDER BY id'
    )
    .all(batchId) as Array<{
    id: number;
    product_name: string;
    flavor: string;
    quantity: number;
    unit_price: number;
  }>;
  const arrived = db
    .prepare(
      'SELECT plan_id, COALESCE(SUM(quantity), 0) AS qty FROM arrival_records WHERE batch_id = ? GROUP BY plan_id'
    )
    .all(batchId) as Array<{ plan_id: number; qty: number }>;
  const shipped = db
    .prepare(
      'SELECT plan_id, COALESCE(SUM(quantity), 0) AS qty FROM shipments WHERE batch_id = ? AND plan_id IS NOT NULL GROUP BY plan_id'
    )
    .all(batchId) as Array<{ plan_id: number; qty: number }>;

  const arrivedMap = new Map(arrived.map((row) => [row.plan_id, round2(row.qty)]));
  const shippedMap = new Map(shipped.map((row) => [row.plan_id, round2(row.qty)]));

  const bookings = db
    .prepare('SELECT * FROM plan_bookings WHERE batch_id = ? ORDER BY id')
    .all(batchId) as Array<{
    id: number;
    plan_id: number;
    customer_name: string;
    quantity: number;
  }>;
  const shippedByCustomer = db
    .prepare(
      `SELECT plan_id, customer_name, COALESCE(SUM(quantity), 0) AS qty
       FROM shipments WHERE batch_id = ? AND plan_id IS NOT NULL
       GROUP BY plan_id, customer_name`
    )
    .all(batchId) as Array<{ plan_id: number; customer_name: string; qty: number }>;
  const shippedByCustomerMap = new Map(
    shippedByCustomer.map((row) => [`${row.plan_id}::${row.customer_name}`, round2(row.qty)])
  );

  const allArrived = db.prepare(
    `SELECT COALESCE(SUM(a.quantity), 0) AS qty
     FROM arrival_records a JOIN plans p ON p.id = a.plan_id
     WHERE p.product_name = ? AND p.flavor = ?`
  );
  const allShipped = db.prepare(
    `SELECT COALESCE(SUM(quantity), 0) AS qty
     FROM shipments WHERE product_name = ? AND flavor = ?`
  );

  return plans.map((plan) => {
    const actual = arrivedMap.get(plan.id) ?? 0;
    const shippedQty = shippedMap.get(plan.id) ?? 0;
    const totalArrived = (allArrived.get(plan.product_name, plan.flavor) as { qty: number }).qty;
    const totalShipped = (allShipped.get(plan.product_name, plan.flavor) as { qty: number }).qty;
    return {
      plan_id: plan.id,
      product_name: plan.product_name,
      flavor: plan.flavor,
      stock: Math.max(round2(totalArrived - totalShipped), 0),
      planned_quantity: round2(plan.quantity),
      planned_unit_price: round2(plan.unit_price),
      actual_quantity: actual,
      shipped_quantity: shippedQty,
      remaining_quantity: Math.max(round2(actual - shippedQty), 0),
      bookings: bookings
        .filter((booking) => booking.plan_id === plan.id)
        .map((booking) => ({
          booking_id: booking.id,
          customer_name: booking.customer_name,
          quantity: round2(booking.quantity),
          allocated_quantity:
            shippedByCustomerMap.get(`${plan.id}::${booking.customer_name}`) ?? 0,
        })),
    };
  });
}

function buildShipmentView(batchId: number) {
  const shipments = db
    .prepare('SELECT * FROM shipments WHERE batch_id = ? ORDER BY id')
    .all(batchId) as ShipmentRow[];
  const receiptMap = loadReceipts(batchId);

  let salesTotal = 0;
  let waivedTotal = 0;
  let receivedTotal = 0;
  let remainingTotal = 0;

  const views = shipments.map((shipment) => {
    const receipts = receiptMap.get(shipment.id) ?? [];
    const received = round2(receipts.reduce((sum, r) => sum + r.amount, 0));
    const remaining = remainingDebt(shipment.sales_amount, shipment.waived_amount, received);

    salesTotal = round2(salesTotal + shipment.sales_amount);
    waivedTotal = round2(waivedTotal + shipment.waived_amount);
    receivedTotal = round2(receivedTotal + received);
    remainingTotal = round2(remainingTotal + remaining);

    return {
      ...shipment,
      received_amount: received,
      remaining_amount: remaining,
      status: debtStatus(shipment.sales_amount, shipment.waived_amount, received),
      receipts,
    };
  });

  return {
    shipments: views,
    plans: loadPlanStock(batchId),
    summary: {
      sales_total: salesTotal,
      waived_total: waivedTotal,
      received_total: receivedTotal,
      remaining_total: remainingTotal,
    },
  };
}

router.get('/:id/shipments', (req, res) => {
  const batchId = Number(req.params.id);
  const batch = db.prepare('SELECT id FROM batches WHERE id = ?').get(batchId);
  if (!batch) {
    res.status(404).json({ error: '批次不存在' });
    return;
  }
  res.json(buildShipmentView(batchId));
});

router.post('/:id/shipments', (req, res) => {
  const batchId = Number(req.params.id);
  const body = (req.body ?? {}) as {
    planId?: number | null;
    customerName?: string;
    date?: string;
    productName?: string;
    flavor?: string;
    quantity?: number;
    unitPrice?: number;
    waivedAmount?: number;
    remark?: string;
  };
  const customerName = typeof body.customerName === 'string' ? body.customerName.trim() : '';
  if (!customerName) {
    res.status(400).json({ error: '客户名称不能为空' });
    return;
  }
  const quantity = Number(body.quantity ?? 0);
  const unitPrice = Number(body.unitPrice ?? 0);
  const waived = Number(body.waivedAmount ?? 0);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    res.status(400).json({ error: '出货数量必须大于 0' });
    return;
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    res.status(400).json({ error: '销售单价不能为负数' });
    return;
  }
  if (!Number.isFinite(waived) || waived < 0) {
    res.status(400).json({ error: '甩零/免收金额不能为负数' });
    return;
  }

  const planId = parsePlanId(body.planId);
  let productName = body.productName ?? null;
  let flavorName = body.flavor ?? null;
  if (planId !== null) {
    const plan = db
      .prepare('SELECT id, product_name, flavor FROM plans WHERE id = ? AND batch_id = ?')
      .get(planId, batchId) as
      | { id: number; product_name: string; flavor: string }
      | undefined;
    if (!plan) {
      res.status(400).json({ error: '口味不存在或不属于该批次' });
      return;
    }
    const stock = loadPlanStock(batchId).find((item) => item.plan_id === planId);
    const available = stock ? stock.remaining_quantity : 0;
    if (quantity > available) {
      res.status(400).json({
        error: `超出可出货数量（剩余 ${available}，本次 ${quantity}）`,
      });
      return;
    }
    productName = plan.product_name;
    flavorName = plan.flavor;
  }

  const now = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO shipments (batch_id, plan_id, customer_name, date, product_name, flavor, quantity, unit_price, sales_amount, waived_amount, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    )
    .run(
      batchId,
      planId,
      customerName,
      body.date ?? null,
      productName,
      flavorName,
      quantity,
      unitPrice,
      salesAmount(quantity, unitPrice),
      waived,
      body.remark ?? null,
      now,
      now
    );
  const shipment = db
    .prepare('SELECT * FROM shipments WHERE id = ?')
    .get(Number(info.lastInsertRowid));
  logAudit('shipment', Number(info.lastInsertRowid), 'create', null, shipment);
  res.status(201).json(shipment);
});

router.patch('/:id/shipments/:shipmentId', (req, res) => {
  const batchId = Number(req.params.id);
  const shipmentId = Number(req.params.shipmentId);
  const shipment = db
    .prepare('SELECT * FROM shipments WHERE id = ? AND batch_id = ?')
    .get(shipmentId, batchId) as ShipmentRow | undefined;
  if (!shipment) {
    res.status(404).json({ error: '出货记录不存在' });
    return;
  }
  const body = (req.body ?? {}) as {
    planId?: number | null;
    customerName?: string;
    date?: string;
    productName?: string;
    flavor?: string;
    quantity?: number;
    unitPrice?: number;
    waivedAmount?: number;
    remark?: string;
  };
  const customerName =
    body.customerName !== undefined ? String(body.customerName).trim() : shipment.customer_name;
  if (!customerName) {
    res.status(400).json({ error: '客户名称不能为空' });
    return;
  }
  const quantity = body.quantity !== undefined ? Number(body.quantity) : shipment.quantity;
  const unitPrice = body.unitPrice !== undefined ? Number(body.unitPrice) : shipment.unit_price;
  const waived = body.waivedAmount !== undefined ? Number(body.waivedAmount) : shipment.waived_amount;
  if (!Number.isFinite(quantity) || quantity <= 0) {
    res.status(400).json({ error: '出货数量必须大于 0' });
    return;
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    res.status(400).json({ error: '销售单价不能为负数' });
    return;
  }
  if (!Number.isFinite(waived) || waived < 0) {
    res.status(400).json({ error: '甩零/免收金额不能为负数' });
    return;
  }

  const planId = body.planId !== undefined ? parsePlanId(body.planId) : shipment.plan_id;
  let productName = body.productName !== undefined ? body.productName : shipment.product_name;
  let flavorName = body.flavor !== undefined ? body.flavor : shipment.flavor;
  if (planId !== null) {
    const plan = db
      .prepare('SELECT id, product_name, flavor FROM plans WHERE id = ? AND batch_id = ?')
      .get(planId, batchId) as
      | { id: number; product_name: string; flavor: string }
      | undefined;
    if (!plan) {
      res.status(400).json({ error: '口味不存在或不属于该批次' });
      return;
    }
    const stock = loadPlanStock(batchId).find((item) => item.plan_id === planId);
    const otherShipped = stock
      ? round2(stock.shipped_quantity - (shipment.plan_id === planId ? shipment.quantity : 0))
      : 0;
    const available = Math.max(round2((stock?.actual_quantity ?? 0) - otherShipped), 0);
    if (quantity > available) {
      res.status(400).json({
        error: `超出可出货数量（剩余 ${available}，本次 ${quantity}）`,
      });
      return;
    }
    productName = plan.product_name;
    flavorName = plan.flavor;
  }

  db.prepare(
    'UPDATE shipments SET plan_id = ?, customer_name = ?, date = ?, product_name = ?, flavor = ?, quantity = ?, unit_price = ?, sales_amount = ?, waived_amount = ?, remark = ?, updated_at = ? WHERE id = ?'
  ).run(
    planId,
    customerName,
    body.date ?? shipment.date,
    productName,
    flavorName,
    quantity,
    unitPrice,
    salesAmount(quantity, unitPrice),
    waived,
    body.remark ?? shipment.remark,
    new Date().toISOString(),
    shipmentId
  );
  const after = db.prepare('SELECT * FROM shipments WHERE id = ?').get(shipmentId);
  logAudit('shipment', shipmentId, 'update', shipment, after);
  res.json(after);
});

router.delete('/:id/shipments/:shipmentId', (req, res) => {
  const batchId = Number(req.params.id);
  const shipmentId = Number(req.params.shipmentId);
  const before = db
    .prepare('SELECT * FROM shipments WHERE id = ? AND batch_id = ?')
    .get(shipmentId, batchId);
  db.prepare('DELETE FROM receipts WHERE shipment_id = ? AND batch_id = ?').run(shipmentId, batchId);
  db.prepare('DELETE FROM shipments WHERE id = ? AND batch_id = ?').run(shipmentId, batchId);
  if (before) logAudit('shipment', shipmentId, 'delete', before, null);
  res.status(204).end();
});

router.get('/:id/receipts', (req, res) => {
  const batchId = Number(req.params.id);
  const receipts = db
    .prepare('SELECT * FROM receipts WHERE batch_id = ? ORDER BY id')
    .all(batchId);
  res.json(receipts);
});

router.post('/:id/shipments/:shipmentId/receipts', (req, res) => {
  const batchId = Number(req.params.id);
  const shipmentId = Number(req.params.shipmentId);
  const shipment = db
    .prepare('SELECT * FROM shipments WHERE id = ? AND batch_id = ?')
    .get(shipmentId, batchId) as ShipmentRow | undefined;
  if (!shipment) {
    res.status(404).json({ error: '出货记录不存在' });
    return;
  }
  const body = (req.body ?? {}) as { date?: string; amount?: number; remark?: string };
  const amount = Number(body.amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: '收款金额必须大于 0' });
    return;
  }
  const received = (
    db.prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM receipts WHERE shipment_id = ?').get(shipmentId) as {
      s: number;
    }
  ).s;
  const remaining = remainingDebt(shipment.sales_amount, shipment.waived_amount, received);
  if (remaining <= 0) {
    res.status(400).json({ error: '该笔出货已结清，无需再收款' });
    return;
  }
  if (amount > remaining) {
    res.status(400).json({ error: `收款金额超过剩余欠款（剩余 ${remaining}）` });
    return;
  }
  const now = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO receipts (batch_id, shipment_id, date, amount, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(batchId, shipmentId, body.date ?? null, amount, body.remark ?? null, now, now);
  const receipt = db.prepare('SELECT * FROM receipts WHERE id = ?').get(Number(info.lastInsertRowid));
  logAudit('receipt', Number(info.lastInsertRowid), 'create', null, receipt);
  res.status(201).json(receipt);
});

router.delete('/:id/receipts/:receiptId', (req, res) => {
  const batchId = Number(req.params.id);
  const receiptId = Number(req.params.receiptId);
  const before = db
    .prepare('SELECT * FROM receipts WHERE id = ? AND batch_id = ?')
    .get(receiptId, batchId);
  db.prepare('DELETE FROM receipts WHERE id = ? AND batch_id = ?').run(receiptId, batchId);
  if (before) logAudit('receipt', receiptId, 'delete', before, null);
  res.status(204).end();
});

router.post('/:id/allocate', (req, res) => {
  const batchId = Number(req.params.id);
  const batch = db.prepare('SELECT id FROM batches WHERE id = ?').get(batchId);
  if (!batch) {
    res.status(404).json({ error: '批次不存在' });
    return;
  }
  const body = (req.body ?? {}) as {
    date?: string;
    items?: Array<{ planId?: number; customerName?: string; quantity?: number }>;
  };
  const rawItems = Array.isArray(body.items) ? body.items : [];
  const items = rawItems
    .map((item) => ({
      planId: Number(item.planId),
      customerName: typeof item.customerName === 'string' ? item.customerName.trim() : '',
      quantity: Number(item.quantity ?? 0),
    }))
    .filter((item) => Number.isFinite(item.planId) && item.customerName);

  if (items.length === 0) {
    res.json(buildShipmentView(batchId));
    return;
  }

  for (const item of items) {
    if (!Number.isFinite(item.quantity) || item.quantity < 0) {
      res.status(400).json({ error: '分货数量不能为负数' });
      return;
    }
    const plan = db
      .prepare('SELECT id FROM plans WHERE id = ? AND batch_id = ?')
      .get(item.planId, batchId);
    if (!plan) {
      res.status(400).json({ error: '口味不存在或不属于该批次' });
      return;
    }
  }

  const desiredByPlan = new Map<number, number>();
  for (const item of items) {
    desiredByPlan.set(
      item.planId,
      round2((desiredByPlan.get(item.planId) ?? 0) + item.quantity)
    );
  }
  for (const [planId, desired] of desiredByPlan) {
    const arrived = (
      db
        .prepare(
          'SELECT COALESCE(SUM(quantity), 0) AS q FROM arrival_records WHERE batch_id = ? AND plan_id = ?'
        )
        .get(batchId, planId) as { q: number }
    ).q;
    if (desired > round2(arrived)) {
      const plan = db.prepare('SELECT flavor FROM plans WHERE id = ?').get(planId) as {
        flavor: string;
      };
      res.status(400).json({
        error: `「${plan.flavor}」分货合计超出到货（到货 ${round2(arrived)}，本次合计 ${desired}）`,
      });
      return;
    }
  }

  const now = new Date().toISOString();
  const run = db.transaction(() => {
    for (const item of items) {
      const plan = db
        .prepare('SELECT id, flavor, product_name, unit_price FROM plans WHERE id = ? AND batch_id = ?')
        .get(item.planId, batchId) as {
        id: number;
        flavor: string;
        product_name: string;
        unit_price: number;
      };
      const existing = db
        .prepare(
          'SELECT * FROM shipments WHERE batch_id = ? AND plan_id = ? AND customer_name = ? ORDER BY id DESC'
        )
        .all(batchId, item.planId, item.customerName) as ShipmentRow[];
      const existingTotal = round2(existing.reduce((sum, row) => sum + row.quantity, 0));
      const diff = round2(item.quantity - existingTotal);

      if (diff > 0) {
        const price = existing.length > 0 ? Number(existing[0].unit_price) : Number(plan.unit_price);
        db.prepare(
          'INSERT INTO shipments (batch_id, plan_id, customer_name, date, product_name, flavor, quantity, unit_price, sales_amount, waived_amount, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, ?, ?)'
        ).run(
          batchId,
          item.planId,
          item.customerName,
          body.date ?? null,
          plan.product_name,
          plan.flavor,
          diff,
          price,
          salesAmount(diff, price),
          now,
          now
        );
      } else if (diff < 0) {
        let reduce = round2(-diff);
        for (const shipment of existing) {
          if (reduce <= 0) break;
          const receiptCount = (
            db
              .prepare('SELECT COUNT(*) AS c FROM receipts WHERE shipment_id = ?')
              .get(shipment.id) as { c: number }
          ).c;
          if (receiptCount > 0) {
            throw new Error('该客户已有收款记录，无法减少分货，请先处理收款');
          }
          const take = Math.min(shipment.quantity, reduce);
          const newQuantity = round2(shipment.quantity - take);
          if (newQuantity <= 0) {
            db.prepare('DELETE FROM shipments WHERE id = ?').run(shipment.id);
          } else {
            db.prepare(
              'UPDATE shipments SET quantity = ?, sales_amount = ?, updated_at = ? WHERE id = ?'
            ).run(newQuantity, salesAmount(newQuantity, shipment.unit_price), now, shipment.id);
          }
          reduce = round2(reduce - take);
        }
      }
    }
  });

  try {
    run();
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : '分货保存失败',
    });
    return;
  }

  logAudit('allocation', null, 'save', null, items);
  res.json(buildShipmentView(batchId));
});

router.post('/:id/settle', (req, res) => {
  const batchId = Number(req.params.id);
  const batch = db.prepare('SELECT id FROM batches WHERE id = ?').get(batchId);
  if (!batch) {
    res.status(404).json({ error: '批次不存在' });
    return;
  }
  const body = (req.body ?? {}) as {
    date?: string;
    items?: Array<{ customerName?: string; received?: number; waived?: number }>;
  };
  const items = (Array.isArray(body.items) ? body.items : [])
    .map((item) => ({
      customerName: typeof item.customerName === 'string' ? item.customerName.trim() : '',
      received: Number(item.received ?? 0),
      waived:
        item.waived === undefined || item.waived === null
          ? null
          : Number(item.waived),
    }))
    .filter((item) => item.customerName);

  if (items.length === 0) {
    res.json(buildShipmentView(batchId));
    return;
  }

  for (const item of items) {
    if (!Number.isFinite(item.received) || item.received < 0) {
      res.status(400).json({ error: '已收金额不能为负数' });
      return;
    }
    if (item.waived !== null && (!Number.isFinite(item.waived) || item.waived < 0)) {
      res.status(400).json({ error: '甩零金额不能为负数' });
      return;
    }
  }

  const now = new Date().toISOString();
  const date = body.date ?? now.slice(0, 10);

  const run = db.transaction(() => {
    for (const item of items) {
      const shipments = db
        .prepare('SELECT * FROM shipments WHERE batch_id = ? AND customer_name = ? ORDER BY id')
        .all(batchId, item.customerName) as ShipmentRow[];
      if (shipments.length === 0) {
        throw new Error(`客户「${item.customerName}」没有出货记录`);
      }

      const grossReceivable = round2(
        shipments.reduce((sum, row) => sum + Number(row.sales_amount), 0)
      );
      const currentWaived = round2(
        shipments.reduce((sum, row) => sum + Number(row.waived_amount), 0)
      );
      const targetWaived = item.waived === null ? currentWaived : round2(item.waived);
      const targetReceived = round2(item.received);
      if (targetReceived + targetWaived > grossReceivable + 0.004) {
        throw new Error(
          `客户「${item.customerName}」已收 + 甩零不能超过应收（应收 ${grossReceivable}）`
        );
      }

      const existingReceipts = db
        .prepare(
          `SELECT r.* FROM receipts r
           JOIN shipments s ON s.id = r.shipment_id
           WHERE s.batch_id = ? AND s.customer_name = ?
           ORDER BY r.id DESC`
        )
        .all(batchId, item.customerName) as ReceiptRow[];
      const receivedByShipment = new Map<number, number>();
      for (const receipt of existingReceipts) {
        receivedByShipment.set(
          receipt.shipment_id,
          round2((receivedByShipment.get(receipt.shipment_id) ?? 0) + receipt.amount)
        );
      }
      for (const shipment of shipments) {
        if (!receivedByShipment.has(shipment.id)) {
          receivedByShipment.set(shipment.id, 0);
        }
      }
      const waivedByShipment = new Map<number, number>(
        shipments.map((shipment) => [shipment.id, round2(Number(shipment.waived_amount))])
      );

      let existingTotal = round2(
        existingReceipts.reduce((sum, row) => sum + row.amount, 0)
      );

      // 先减少已收，给甩零腾出空间；否则“增加甩零、减少已收”会被误判超限
      if (targetReceived < existingTotal) {
        let reduce = round2(existingTotal - targetReceived);
        for (const receipt of existingReceipts) {
          if (reduce <= 0) break;
          const take = Math.min(receipt.amount, reduce);
          const remain = round2(receipt.amount - take);
          if (remain <= 0) {
            db.prepare('DELETE FROM receipts WHERE id = ?').run(receipt.id);
            receivedByShipment.set(
              receipt.shipment_id,
              round2((receivedByShipment.get(receipt.shipment_id) ?? 0) - receipt.amount)
            );
          } else {
            db.prepare('UPDATE receipts SET amount = ?, updated_at = ? WHERE id = ?').run(
              remain,
              now,
              receipt.id
            );
            receivedByShipment.set(
              receipt.shipment_id,
              round2((receivedByShipment.get(receipt.shipment_id) ?? 0) - take)
            );
          }
          reduce = round2(reduce - take);
        }
        existingTotal = targetReceived;
      }

      const waivedDiff = round2(targetWaived - currentWaived);
      if (waivedDiff > 0) {
        let remaining = waivedDiff;
        for (const shipment of shipments) {
          if (remaining <= 0) break;
          const capacity = Math.max(
            round2(
              shipment.sales_amount -
                (receivedByShipment.get(shipment.id) ?? 0) -
                (waivedByShipment.get(shipment.id) ?? 0)
            ),
            0
          );
          if (capacity <= 0) continue;
          const add = Math.min(capacity, remaining);
          const nextWaived = round2((waivedByShipment.get(shipment.id) ?? 0) + add);
          waivedByShipment.set(shipment.id, nextWaived);
          db.prepare(
            'UPDATE shipments SET waived_amount = ?, updated_at = ? WHERE id = ?'
          ).run(nextWaived, now, shipment.id);
          remaining = round2(remaining - add);
        }
        if (remaining > 0) {
          throw new Error(`客户「${item.customerName}」甩零金额超出可甩零余额`);
        }
      } else if (waivedDiff < 0) {
        let reduce = round2(-waivedDiff);
        for (const shipment of [...shipments].reverse()) {
          if (reduce <= 0) break;
          const current = waivedByShipment.get(shipment.id) ?? 0;
          if (current <= 0) continue;
          const take = Math.min(current, reduce);
          const nextWaived = round2(current - take);
          waivedByShipment.set(shipment.id, nextWaived);
          db.prepare(
            'UPDATE shipments SET waived_amount = ?, updated_at = ? WHERE id = ?'
          ).run(nextWaived, now, shipment.id);
          reduce = round2(reduce - take);
        }
      }

      let diff = round2(targetReceived - existingTotal);
      if (diff > 0) {
        for (const shipment of shipments) {
          if (diff <= 0) break;
          const capacity = round2(
            shipment.sales_amount -
              (waivedByShipment.get(shipment.id) ?? 0) -
              (receivedByShipment.get(shipment.id) ?? 0)
          );
          if (capacity <= 0) continue;
          const amount = Math.min(capacity, diff);
          db.prepare(
            'INSERT INTO receipts (batch_id, shipment_id, date, amount, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
          ).run(batchId, shipment.id, date, amount, '确认收款', now, now);
          receivedByShipment.set(
            shipment.id,
            round2((receivedByShipment.get(shipment.id) ?? 0) + amount)
          );
          diff = round2(diff - amount);
        }
        if (diff > 0) {
          throw new Error(`客户「${item.customerName}」收款金额超出可收余额`);
        }
      }
    }
  });

  try {
    run();
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : '收款保存失败',
    });
    return;
  }

  logAudit('receipt', null, 'settle', null, items);
  res.json(buildShipmentView(batchId));
});

export default router;
