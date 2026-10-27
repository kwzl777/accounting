import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { arrivalAmount, exchangeLoss, planAmount, round2 } from '../calc.js';

const router = Router();

router.use(requireAuth);

interface ProductRow {
  id: number;
  name: string;
  supplier: string | null;
  base_price: number;
  remark: string | null;
}

interface FlavorRow {
  id: number;
  product_id: number;
  flavor: string;
  price: number;
}

function localDateString(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function stockFor(productName: string, flavor: string): number {
  const arrived = (
    db
      .prepare(
        `SELECT COALESCE(SUM(a.quantity), 0) AS q
         FROM arrival_records a JOIN plans p ON p.id = a.plan_id
         WHERE p.product_name = ? AND p.flavor = ?`
      )
      .get(productName, flavor) as { q: number }
  ).q;
  const shipped = (
    db
      .prepare(
        `SELECT COALESCE(SUM(s.quantity), 0) AS q
         FROM shipments s JOIN plans p ON p.id = s.plan_id
         WHERE p.product_name = ? AND p.flavor = ?`
      )
      .get(productName, flavor) as { q: number }
  ).q;
  return Math.max(round2(arrived - shipped), 0);
}

function activeBatchFor(productName: string, flavor: string): number | null {
  const row = db
    .prepare(
      `SELECT p.batch_id AS batch_id
       FROM plans p JOIN batches b ON b.id = p.batch_id
       WHERE p.product_name = ? AND p.flavor = ? AND b.status != '已归档'
       ORDER BY p.id DESC LIMIT 1`
    )
    .get(productName, flavor) as { batch_id: number } | undefined;
  return row ? row.batch_id : null;
}

function buildFlavorView(product: ProductRow, flavor: FlavorRow) {
  return {
    ...flavor,
    stock: stockFor(product.name, flavor.flavor),
    active_batch_id: activeBatchFor(product.name, flavor.flavor),
  };
}

function buildProductView(product: ProductRow) {
  const flavors = db
    .prepare('SELECT * FROM product_flavors WHERE product_id = ? ORDER BY id')
    .all(product.id) as FlavorRow[];
  const flavorViews = flavors.map((flavor) => buildFlavorView(product, flavor));
  const stock = round2(flavorViews.reduce((sum, flavor) => sum + flavor.stock, 0));
  const preorderCount = (
    db
      .prepare('SELECT COUNT(*) AS c FROM preorders WHERE product_name = ?')
      .get(product.name) as { c: number }
  ).c;
  const unshippedQuantity = (
    db
      .prepare(
        'SELECT COALESCE(SUM(total_quantity), 0) AS q FROM preorders WHERE product_name = ?'
      )
      .get(product.name) as { q: number }
  ).q;
  return {
    ...product,
    stock,
    flavors: flavorViews,
    preorder_count: preorderCount,
    unshipped_quantity: round2(unshippedQuantity),
  };
}

function refreshBatchStatus(batchId: number): void {
  const batch = db.prepare('SELECT status FROM batches WHERE id = ?').get(batchId) as
    | { status: string }
    | undefined;
  if (!batch || ['经营中', '已结算', '已归档'].includes(batch.status)) return;
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

router.get('/', (_req, res) => {
  const products = db.prepare('SELECT * FROM products ORDER BY id').all() as ProductRow[];
  res.json({ products: products.map(buildProductView) });
});

router.get('/shipments', (_req, res) => {
  const shipments = db
    .prepare('SELECT * FROM product_shipments ORDER BY ship_date DESC, id DESC')
    .all() as Array<Record<string, unknown>>;
  res.json({ shipments: shipments.map(shipmentView) });
});

router.get('/:id', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(Number(req.params.id)) as
    | ProductRow
    | undefined;
  if (!product) {
    res.status(404).json({ error: '产品不存在' });
    return;
  }
  res.json({ product: buildProductView(product) });
});

router.post('/', (req, res) => {
  const body = (req.body ?? {}) as {
    name?: string;
    supplier?: string;
    price?: number;
    remark?: string;
  };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const supplier = typeof body.supplier === 'string' ? body.supplier.trim() : '';
  const price = Number(body.price ?? 0);
  const remark = typeof body.remark === 'string' ? body.remark.trim() : '';
  if (!name) {
    res.status(400).json({ error: '产品名称不能为空' });
    return;
  }
  if (!Number.isFinite(price) || price < 0) {
    res.status(400).json({ error: '价格不能为负数' });
    return;
  }
  const exists = db.prepare('SELECT id FROM products WHERE name = ?').get(name);
  if (exists) {
    res.status(400).json({ error: '该产品已存在' });
    return;
  }
  const now = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO products (name, supplier, base_price, remark, created_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(name, supplier || null, price, remark || null, now);
  const productId = Number(info.lastInsertRowid);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as ProductRow;
  res.status(201).json({ product: buildProductView(product) });
});

router.post('/:id/flavors', (req, res) => {
  const productId = Number(req.params.id);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
    | ProductRow
    | undefined;
  if (!product) {
    res.status(404).json({ error: '产品不存在' });
    return;
  }
  const body = (req.body ?? {}) as { flavor?: string; price?: number };
  const flavor = typeof body.flavor === 'string' ? body.flavor.trim() : '';
  const price = Number(body.price ?? 0);
  if (!flavor) {
    res.status(400).json({ error: '口味不能为空' });
    return;
  }
  if (!Number.isFinite(price) || price < 0) {
    res.status(400).json({ error: '单价不能为负数' });
    return;
  }
  const exists = db
    .prepare('SELECT id FROM product_flavors WHERE product_id = ? AND flavor = ?')
    .get(productId, flavor);
  if (exists) {
    res.status(400).json({ error: '该口味已存在' });
    return;
  }
  const now = new Date().toISOString();
  const info = db
    .prepare(
      'INSERT INTO product_flavors (product_id, flavor, price, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
    )
    .run(productId, flavor, price, now, now);
  const row = db
    .prepare('SELECT * FROM product_flavors WHERE id = ?')
    .get(Number(info.lastInsertRowid)) as FlavorRow;
  res.status(201).json({ flavor: buildFlavorView(product, row) });
});

router.patch('/:id/flavors/:flavorId', (req, res) => {
  const productId = Number(req.params.id);
  const flavorId = Number(req.params.flavorId);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
    | ProductRow
    | undefined;
  if (!product) {
    res.status(404).json({ error: '产品不存在' });
    return;
  }
  const current = db
    .prepare('SELECT * FROM product_flavors WHERE id = ? AND product_id = ?')
    .get(flavorId, productId) as FlavorRow | undefined;
  if (!current) {
    res.status(404).json({ error: '口味不存在' });
    return;
  }
  const body = (req.body ?? {}) as { flavor?: string; price?: number };
  const flavor = body.flavor !== undefined ? String(body.flavor).trim() : current.flavor;
  const price = body.price !== undefined ? Number(body.price) : current.price;
  if (!flavor) {
    res.status(400).json({ error: '口味不能为空' });
    return;
  }
  if (!Number.isFinite(price) || price < 0) {
    res.status(400).json({ error: '单价不能为负数' });
    return;
  }
  const duplicate = db
    .prepare('SELECT id FROM product_flavors WHERE product_id = ? AND flavor = ? AND id != ?')
    .get(productId, flavor, flavorId);
  if (duplicate) {
    res.status(400).json({ error: '该口味已存在' });
    return;
  }
  db.prepare(
    'UPDATE product_flavors SET flavor = ?, price = ?, updated_at = ? WHERE id = ?'
  ).run(flavor, price, new Date().toISOString(), flavorId);
  const row = db.prepare('SELECT * FROM product_flavors WHERE id = ?').get(flavorId) as FlavorRow;
  res.json({ flavor: buildFlavorView(product, row) });
});

router.delete('/:id/flavors/:flavorId', (req, res) => {
  const productId = Number(req.params.id);
  const flavorId = Number(req.params.flavorId);
  db.prepare('DELETE FROM product_flavors WHERE id = ? AND product_id = ?').run(
    flavorId,
    productId
  );
  res.status(204).end();
});

/** 新建预定：一个批次包含该产品的全部口味（每个口味一行） */
router.post('/:id/order', (req, res) => {
  const productId = Number(req.params.id);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
    | ProductRow
    | undefined;
  if (!product) {
    res.status(404).json({ error: '产品不存在' });
    return;
  }
  const flavors = db
    .prepare('SELECT * FROM product_flavors WHERE product_id = ? ORDER BY id')
    .all(productId) as FlavorRow[];
  if (flavors.length === 0) {
    res.status(400).json({ error: '该产品暂无口味，请先添加口味' });
    return;
  }
  const body = (req.body ?? {}) as {
    batchName?: string;
    date?: string;
    prices?: Record<string, number>;
  };
  const date =
    typeof body.date === 'string' && body.date.trim()
      ? body.date.trim()
      : new Date().toISOString().slice(0, 10);
  const batchName =
    typeof body.batchName === 'string' && body.batchName.trim()
      ? body.batchName.trim()
      : `${product.name} ${date}`;
  const now = new Date().toISOString();
  const prices = new Map<number, number>();
  for (const flavor of flavors) {
    const raw = body.prices?.[String(flavor.id)];
    const price = raw === undefined ? Number(flavor.price) : Number(raw);
    if (!Number.isFinite(price) || price < 0) {
      res.status(400).json({ error: `「${flavor.flavor}」的价格不能为负数` });
      return;
    }
    prices.set(flavor.id, price);
  }

  const create = db.transaction(() => {
    const batchInfo = db
      .prepare(
        'INSERT INTO batches (name, date, expected_arrival_date, remark, status, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?)'
      )
      .run(batchName, date, null, '待到货', now, now);
    const batchId = Number(batchInfo.lastInsertRowid);
    const insertPlan = db.prepare(
      'INSERT INTO plans (batch_id, product_name, flavor, quantity, unit_price, amount, remark, created_at, updated_at) VALUES (?, ?, ?, 0, ?, 0, NULL, ?, ?)'
    );
    for (const flavor of flavors) {
      insertPlan.run(
        batchId,
        product.name,
        flavor.flavor,
        prices.get(flavor.id) ?? 0,
        now,
        now
      );
    }
    return batchId;
  });

  const batchId = create();
  res.status(201).json({
    batch_id: batchId,
    batch_name: batchName,
    plan_count: flavors.length,
  });
});

/** 找到该产品当天的批次；没有就创建，并补齐全部口味行 */
function ensureProductBatch(product: ProductRow, date: string): number {
  const existing = db
    .prepare(
      `SELECT id, product_id FROM batches
       WHERE date = ? AND status != '已归档'
         AND (product_id = ? OR (product_id IS NULL AND name = ?))
       ORDER BY id DESC LIMIT 1`
    )
    .get(date, product.id, `${product.name} ${date}`) as
    | { id: number; product_id: number | null }
    | undefined;
  let batchId = existing?.id;
  const now = new Date().toISOString();
  if (!batchId) {
    const info = db
      .prepare(
        'INSERT INTO batches (name, date, expected_arrival_date, remark, status, product_id, created_at, updated_at) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?)'
      )
      .run(`${product.name} ${date}`, date, '待到货', product.id, now, now);
    batchId = Number(info.lastInsertRowid);
  } else if (existing && existing.product_id === null) {
    db.prepare('UPDATE batches SET product_id = ?, updated_at = ? WHERE id = ?').run(
      product.id,
      now,
      batchId
    );
  }
  const flavors = db
    .prepare('SELECT * FROM product_flavors WHERE product_id = ? ORDER BY id')
    .all(product.id) as FlavorRow[];
  const existsPlan = db.prepare('SELECT id FROM plans WHERE batch_id = ? AND flavor = ?');
  const insertPlan = db.prepare(
    'INSERT INTO plans (batch_id, product_name, flavor, quantity, unit_price, amount, remark, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0, NULL, ?, ?)'
  );
  for (const flavor of flavors) {
    if (!existsPlan.get(batchId, flavor.flavor)) {
      insertPlan.run(batchId, product.name, flavor.flavor, now, now);
    }
  }
  return batchId;
}

/** 预定：客户 + 统一价格 + 各口味数量；保存到当天批次，并同步预订人和总数 */
router.post('/:id/preorders', (req, res) => {
  const productId = Number(req.params.id);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
    | ProductRow
    | undefined;
  if (!product) {
    res.status(404).json({ error: '产品不存在' });
    return;
  }
  const body = (req.body ?? {}) as {
    customerName?: string;
    unitPrice?: number;
    date?: string;
    items?: Array<{ flavor?: string; quantity?: number }>;
  };
  const customerName =
    typeof body.customerName === 'string' ? body.customerName.trim() : '';
  const unitPrice = Number(body.unitPrice ?? 0);
  const date =
    typeof body.date === 'string' && body.date.trim()
      ? body.date.trim()
      : new Date().toISOString().slice(0, 10);
  if (!customerName) {
    res.status(400).json({ error: '请输入客户名字' });
    return;
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    res.status(400).json({ error: '价格不能为负数' });
    return;
  }
  const flavors = db
    .prepare('SELECT * FROM product_flavors WHERE product_id = ? ORDER BY id')
    .all(productId) as FlavorRow[];
  if (flavors.length === 0) {
    res.status(400).json({ error: '该产品暂无口味，请先添加口味' });
    return;
  }
  const flavorMap = new Map(flavors.map((flavor) => [flavor.flavor, flavor]));
  const quantities = new Map<string, number>();
  for (const item of body.items ?? []) {
    const flavor = typeof item.flavor === 'string' ? item.flavor.trim() : '';
    const quantity = Number(item.quantity ?? 0);
    if (!flavor) continue;
    if (!flavorMap.has(flavor)) {
      res.status(400).json({ error: `口味「${flavor}」不存在` });
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    quantities.set(flavor, round2((quantities.get(flavor) ?? 0) + quantity));
  }
  if (quantities.size === 0) {
    res.status(400).json({ error: '请至少填写一个口味的数量' });
    return;
  }
  const totalQuantity = round2(
    [...quantities.values()].reduce((sum, qty) => sum + qty, 0)
  );

  const preorderId = db.transaction(() => {
    const batchId = ensureProductBatch(product, date);
    const now = new Date().toISOString();
    const preorderInfo = db
      .prepare(
        'INSERT INTO preorders (batch_id, product_name, customer_name, unit_price, date, total_quantity, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
      )
      .run(batchId, product.name, customerName, unitPrice, date, totalQuantity, now, now);
    const id = Number(preorderInfo.lastInsertRowid);
    const insertBooking = db.prepare(
      'INSERT INTO plan_bookings (plan_id, batch_id, customer_name, quantity, preorder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    const findPlan = db.prepare(
      'SELECT id, unit_price FROM plans WHERE batch_id = ? AND flavor = ?'
    );
    const updatePlanPrice = db.prepare(
      'UPDATE plans SET unit_price = ?, updated_at = ? WHERE id = ?'
    );
    for (const [flavor, quantity] of quantities) {
      const plan = findPlan.get(batchId, flavor) as
        | { id: number; unit_price: number }
        | undefined;
      if (!plan) continue;
      if (Number(plan.unit_price) <= 0 && unitPrice > 0) {
        updatePlanPrice.run(unitPrice, now, plan.id);
      }
      insertBooking.run(plan.id, batchId, customerName, quantity, id, now, now);
    }
    const affected = db
      .prepare('SELECT id FROM plans WHERE batch_id = ?')
      .all(batchId) as Array<{ id: number }>;
    const sumBookings = db.prepare(
      'SELECT COALESCE(SUM(quantity), 0) AS qty FROM plan_bookings WHERE plan_id = ?'
    );
    const updatePlan = db.prepare(
      'UPDATE plans SET quantity = ?, amount = ?, updated_at = ? WHERE id = ?'
    );
    for (const plan of affected) {
      const row = sumBookings.get(plan.id) as { qty: number };
      const planRow = db
        .prepare('SELECT unit_price FROM plans WHERE id = ?')
        .get(plan.id) as { unit_price: number };
      const quantity = round2(row.qty);
      updatePlan.run(quantity, planAmount(quantity, Number(planRow.unit_price)), now, plan.id);
    }
    return id;
  })();

  const preorder = db.prepare('SELECT * FROM preorders WHERE id = ?').get(preorderId);
  const items = db
    .prepare(
      `SELECT p.flavor, pb.quantity
       FROM plan_bookings pb JOIN plans p ON p.id = pb.plan_id
       WHERE pb.preorder_id = ? ORDER BY pb.id`
    )
    .all(preorderId);
  res.status(201).json({ preorder: { ...(preorder as object), items } });
});

/** 已定：该产品全部预定单 + 每个口味总数 */
router.get('/:id/preorders', (req, res) => {
  const productId = Number(req.params.id);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
    | ProductRow
    | undefined;
  if (!product) {
    res.status(404).json({ error: '产品不存在' });
    return;
  }
  const orders = db
    .prepare(
      'SELECT * FROM preorders WHERE product_name = ? ORDER BY date DESC, id DESC'
    )
    .all(product.name) as Array<{
    id: number;
    customer_name: string;
    unit_price: number;
    date: string | null;
    total_quantity: number;
  }>;
  const itemRows = db
    .prepare(
      `SELECT pb.preorder_id, p.flavor, pb.quantity
       FROM plan_bookings pb
       JOIN plans p ON p.id = pb.plan_id
       JOIN preorders o ON o.id = pb.preorder_id
       WHERE o.product_name = ?
       ORDER BY pb.id`
    )
    .all(product.name) as Array<{ preorder_id: number; flavor: string; quantity: number }>;
  const itemsByOrder = new Map<number, Array<{ flavor: string; quantity: number }>>();
  const totalsByFlavor = new Map<string, number>();
  for (const row of itemRows) {
    const list = itemsByOrder.get(row.preorder_id) ?? [];
    list.push({ flavor: row.flavor, quantity: round2(row.quantity) });
    itemsByOrder.set(row.preorder_id, list);
    totalsByFlavor.set(
      row.flavor,
      round2((totalsByFlavor.get(row.flavor) ?? 0) + row.quantity)
    );
  }
  const flavorRows = db
    .prepare('SELECT flavor FROM product_flavors WHERE product_id = ? ORDER BY id')
    .all(productId) as Array<{ flavor: string }>;
  const flavors = flavorRows
    .map((row) => ({
      flavor: row.flavor,
      total_quantity: totalsByFlavor.get(row.flavor) ?? 0,
    }))
    .filter((row) => row.total_quantity > 0);

  res.json({
    flavors,
    orders: orders.map((order) => ({
      ...order,
      unit_price: round2(order.unit_price),
      total_quantity: round2(order.total_quantity),
      items: itemsByOrder.get(order.id) ?? [],
    })),
  });
});

interface SettlementBody {
  unitPrice?: number;
  freight?: number;
  exchangeRate?: number | null;
  exchangeLoss?: number;
  buyRate?: number | null;
  sellRate?: number | null;
  fee?: number;
  uPaid?: number;
}

function customerPaymentSummary(batchId: unknown): {
  customer_allocation_count: number;
  customer_unpaid: number;
} {
  const id = Number(batchId);
  if (!Number.isFinite(id) || id <= 0) {
    return { customer_allocation_count: 0, customer_unpaid: 0 };
  }
  const row = db
    .prepare(
      `SELECT COUNT(*) AS allocation_count,
              COALESCE(SUM(
                CASE
                  WHEN s.sales_amount - s.waived_amount - COALESCE(r.received, 0) > 0
                  THEN s.sales_amount - s.waived_amount - COALESCE(r.received, 0)
                  ELSE 0
                END
              ), 0) AS unpaid
       FROM shipments s
       LEFT JOIN (
         SELECT shipment_id, SUM(amount) AS received
         FROM receipts
         GROUP BY shipment_id
       ) r ON r.shipment_id = s.id
       WHERE s.batch_id = ?`
    )
    .get(id) as { allocation_count: number; unpaid: number } | undefined;
  return {
    customer_allocation_count: Number(row?.allocation_count ?? 0),
    customer_unpaid: round2(Number(row?.unpaid ?? 0)),
  };
}

function shipmentView(row: Record<string, unknown>) {
  let details: unknown = null;
  if (typeof row.details_json === 'string') {
    try {
      details = JSON.parse(row.details_json);
    } catch {
      details = null;
    }
  }
  const payments = db
    .prepare(
      'SELECT id, shipment_id, amount, created_at FROM shipment_payments WHERE shipment_id = ? ORDER BY id'
    )
    .all(row.id);
  return {
    ...row,
    details,
    payments,
    ...customerPaymentSummary(row.batch_id),
  };
}

function computeSettlement(
  totalQuantity: number,
  body: SettlementBody,
  current?: Record<string, unknown>
): { error?: string; values?: Record<string, number | null> } {
  const unitPrice =
    body.unitPrice !== undefined ? Number(body.unitPrice) : Number(current?.unit_price ?? 0);
  const freight =
    body.freight !== undefined ? Number(body.freight) : Number(current?.freight ?? 0);
  const fee = body.fee !== undefined ? Number(body.fee) : Number(current?.fee ?? 0);
  const uPaid = body.uPaid !== undefined ? Number(body.uPaid) : Number(current?.u_paid ?? 0);
  const exchangeRate =
    body.exchangeRate === undefined
      ? ((current?.exchange_rate as number | null | undefined) ?? null)
      : body.exchangeRate === null
        ? null
        : Number(body.exchangeRate);
  const exchangeLossValue =
    body.exchangeLoss !== undefined
      ? Number(body.exchangeLoss)
      : Number(current?.exchange_loss ?? 0);
  const buyRate =
    body.buyRate === undefined
      ? ((current?.buy_rate as number | null | undefined) ?? null)
      : body.buyRate === null
        ? null
        : Number(body.buyRate);
  const sellRate =
    body.sellRate === undefined
      ? ((current?.sell_rate as number | null | undefined) ?? null)
      : body.sellRate === null
        ? null
        : Number(body.sellRate);
  if (!Number.isFinite(unitPrice) || unitPrice < 0) return { error: '单价不能为负数' };
  if (!Number.isFinite(freight) || freight < 0) return { error: '运费不能为负数' };
  if (!Number.isFinite(fee) || fee < 0) return { error: '手续费不能为负数' };
  if (!Number.isFinite(uPaid) || uPaid < 0) return { error: '已付 U 不能为负数' };
  if (!Number.isFinite(exchangeLossValue)) return { error: '汇率损耗金额不正确' };
  if (exchangeRate !== null && (!Number.isFinite(exchangeRate) || exchangeRate <= 0)) {
    return { error: '汇率必须大于 0' };
  }
  if (buyRate !== null && (!Number.isFinite(buyRate) || buyRate <= 0)) {
    return { error: '买进汇率必须大于 0' };
  }
  if (sellRate !== null && (!Number.isFinite(sellRate) || sellRate <= 0)) {
    return { error: '卖出汇率必须大于 0' };
  }
  const rmbAmount = round2(totalQuantity * unitPrice + freight);
  const usdAmount =
    exchangeRate !== null && exchangeRate > 0 ? round2(rmbAmount / exchangeRate) : 0;
  const loss = round2(exchangeLossValue);
  const costAmount = round2(rmbAmount + loss);
  const unpaid = round2(usdAmount - uPaid);
  return {
    values: {
      unit_price: unitPrice,
      freight,
      exchange_rate: exchangeRate,
      buy_rate: buyRate,
      sell_rate: sellRate,
      fee,
      rmb_amount: rmbAmount,
      u_amount: usdAmount,
      exchange_loss: loss,
      u_paid: uPaid,
      unpaid_u: unpaid,
      cost_amount: costAmount,
    },
  };
}

function buildShipmentSnapshot(productName: string) {
  const orders = db
    .prepare(
      'SELECT id, customer_name, total_quantity, unit_price FROM preorders WHERE product_name = ? ORDER BY id'
    )
    .all(productName) as Array<{
    id: number;
    customer_name: string;
    total_quantity: number;
    unit_price: number;
  }>;
  const itemRows = db
    .prepare(
      `SELECT o.customer_name, p.flavor, pb.quantity
       FROM plan_bookings pb
       JOIN plans p ON p.id = pb.plan_id
       JOIN preorders o ON o.id = pb.preorder_id
       WHERE o.product_name = ?
       ORDER BY pb.id`
    )
    .all(productName) as Array<{ customer_name: string; flavor: string; quantity: number }>;
  const customerNames: string[] = [];
  const customerTotals = new Map<string, number>();
  const customerAmounts = new Map<string, number>();
  for (const order of orders) {
    if (!customerTotals.has(order.customer_name)) {
      customerNames.push(order.customer_name);
      customerTotals.set(order.customer_name, 0);
      customerAmounts.set(order.customer_name, 0);
    }
    customerTotals.set(
      order.customer_name,
      round2((customerTotals.get(order.customer_name) ?? 0) + order.total_quantity)
    );
    customerAmounts.set(
      order.customer_name,
      round2(
        (customerAmounts.get(order.customer_name) ?? 0) +
          order.total_quantity * Number(order.unit_price)
      )
    );
  }
  const byFlavor = new Map<string, Map<string, number>>();
  for (const row of itemRows) {
    const cells = byFlavor.get(row.flavor) ?? new Map<string, number>();
    cells.set(row.customer_name, round2((cells.get(row.customer_name) ?? 0) + row.quantity));
    byFlavor.set(row.flavor, cells);
  }
  const customers = customerNames.map((name) => {
    const total = round2(customerTotals.get(name) ?? 0);
    return {
      name,
      total,
      unit_price:
        total > 0 ? round2((customerAmounts.get(name) ?? 0) / total) : 0,
    };
  });
  const rows = [...byFlavor.keys()].map((flavor) => {
    const cells = customerNames.map((name) => byFlavor.get(flavor)?.get(name) ?? 0);
    return {
      flavor,
      cells,
      total: round2(cells.reduce((sum, value) => sum + value, 0)),
    };
  });
  return { customers, rows };
}

function refreshBatchPlanTotals(batchId: number) {
  const plans = db
    .prepare('SELECT id, unit_price FROM plans WHERE batch_id = ?')
    .all(batchId) as Array<{ id: number; unit_price: number }>;
  const sumBookings = db.prepare(
    'SELECT COALESCE(SUM(quantity), 0) AS qty FROM plan_bookings WHERE plan_id = ?'
  );
  const update = db.prepare(
    'UPDATE plans SET quantity = ?, amount = ?, updated_at = ? WHERE id = ?'
  );
  const now = new Date().toISOString();
  for (const plan of plans) {
    const row = sumBookings.get(plan.id) as { qty: number };
    const quantity = round2(row.qty);
    update.run(quantity, planAmount(quantity, Number(plan.unit_price)), now, plan.id);
  }
}

/** 汇率损耗计算（不保存） */
router.post('/exchange-loss', (req, res) => {
  const body = (req.body ?? {}) as {
    rmbAmount?: number;
    buyRate?: number;
    sellRate?: number;
  };
  const rmbAmount = Number(body.rmbAmount ?? 0);
  const buyRate = Number(body.buyRate ?? 0);
  const sellRate = Number(body.sellRate ?? 0);
  if (!Number.isFinite(rmbAmount) || rmbAmount < 0) {
    res.status(400).json({ error: '人民币金额不能为负数' });
    return;
  }
  if (!Number.isFinite(buyRate) || buyRate <= 0) {
    res.status(400).json({ error: '买进汇率必须大于 0' });
    return;
  }
  if (!Number.isFinite(sellRate) || sellRate <= 0) {
    res.status(400).json({ error: '卖出汇率必须大于 0' });
    return;
  }
  const loss = exchangeLoss({ rmbAmount, buyRate, sellRate });
  res.json({ loss });
});

/** 最近一次发货记录 */
router.get('/:id/shipment', (req, res) => {
  const productId = Number(req.params.id);
  const shipment = db
    .prepare(
      'SELECT * FROM product_shipments WHERE product_id = ? ORDER BY id DESC LIMIT 1'
    )
    .get(productId) as Record<string, unknown> | undefined;
  res.json({ shipment: shipment ? shipmentView(shipment) : null });
});

/** 整批发货：保存客户明细快照、扣库存后数量，并清空本次已定 */
router.post('/:id/shipment', (req, res) => {
  const productId = Number(req.params.id);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
    | ProductRow
    | undefined;
  if (!product) {
    res.status(404).json({ error: '产品不存在' });
    return;
  }
  const preorders = db
    .prepare('SELECT id FROM preorders WHERE product_name = ? ORDER BY id')
    .all(product.name) as Array<{ id: number }>;
  if (preorders.length === 0) {
    res.status(400).json({ error: '暂无预定量，不能发货' });
    return;
  }
  const totals = db
    .prepare(
      `SELECT p.flavor, COALESCE(SUM(pb.quantity), 0) AS qty
       FROM plan_bookings pb
       JOIN plans p ON p.id = pb.plan_id
       JOIN preorders o ON o.id = pb.preorder_id
       WHERE o.product_name = ?
       GROUP BY p.flavor`
    )
    .all(product.name) as Array<{ flavor: string; qty: number }>;
  const totalQuantity = round2(
    totals.reduce(
      (sum, row) => sum + Math.max(round2(row.qty - stockFor(product.name, row.flavor)), 0),
      0
    )
  );
  if (totalQuantity <= 0) {
    res.status(400).json({ error: '扣除库存后没有需要发货的数量' });
    return;
  }
  const snapshot = buildShipmentSnapshot(product.name);
  const preorderIds = preorders.map((row) => row.id);
  const marks = preorderIds.map(() => '?').join(',');
  const batchRows = db
    .prepare(
      `SELECT DISTINCT batch_id FROM plan_bookings WHERE preorder_id IN (${marks})`
    )
    .all(...preorderIds) as Array<{ batch_id: number }>;
  const shipmentBatchId =
    batchRows.length > 0 ? Math.max(...batchRows.map((row) => row.batch_id)) : null;
  const now = new Date().toISOString();
  const shipDate = localDateString();

  const shipmentId = db.transaction(() => {
    const info = db
      .prepare(
        `INSERT INTO product_shipments
         (product_id, batch_id, product_name, ship_date, total_quantity, unit_price, rmb_amount, freight,
          buy_rate, sell_rate, fee, u_amount, exchange_loss, u_paid, unpaid_u, details_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, 0, 0, NULL, NULL, 0, 0, NULL, 0, 0, ?, ?, ?)`
      )
      .run(
        productId,
        shipmentBatchId,
        product.name,
        shipDate,
        totalQuantity,
        JSON.stringify(snapshot),
        now,
        now
      );
    db.prepare(
      `UPDATE plan_bookings SET shipment_id = ?, preorder_id = NULL, updated_at = ? WHERE preorder_id IN (${marks})`
    ).run(Number(info.lastInsertRowid), now, ...preorderIds);
    db.prepare(`DELETE FROM preorders WHERE id IN (${marks})`).run(...preorderIds);
    return Number(info.lastInsertRowid);
  })();

  const shipment = db
    .prepare('SELECT * FROM product_shipments WHERE id = ?')
    .get(shipmentId) as Record<string, unknown>;
  res.status(201).json({ shipment: shipmentView(shipment) });
});

/** 计算发货结算（不保存） */
router.post('/:id/shipments/:shipmentId/calc', (req, res) => {
  const productId = Number(req.params.id);
  const shipmentId = Number(req.params.shipmentId);
  const current = db
    .prepare('SELECT * FROM product_shipments WHERE id = ? AND product_id = ?')
    .get(shipmentId, productId) as Record<string, unknown> | undefined;
  if (!current) {
    res.status(404).json({ error: '发货记录不存在' });
    return;
  }
  const result = computeSettlement(
    Number(current.total_quantity),
    (req.body ?? {}) as SettlementBody,
    current
  );
  if (result.error) {
    res.status(400).json({ error: result.error });
    return;
  }
  res.json({ result: result.values });
});

/** 保存发货结算 */
router.patch('/:id/shipments/:shipmentId', (req, res) => {
  const productId = Number(req.params.id);
  const shipmentId = Number(req.params.shipmentId);
  const current = db
    .prepare('SELECT * FROM product_shipments WHERE id = ? AND product_id = ?')
    .get(shipmentId, productId) as Record<string, unknown> | undefined;
  if (!current) {
    res.status(404).json({ error: '发货记录不存在' });
    return;
  }
  const result = computeSettlement(
    Number(current.total_quantity),
    (req.body ?? {}) as SettlementBody,
    current
  );
  if (result.error || !result.values) {
    res.status(400).json({ error: result.error ?? '结算数据不正确' });
    return;
  }
  const values = result.values;
  const oldPaid = Number(current.u_paid);
  const newPaid = Number(values.u_paid ?? 0);
  if (newPaid < oldPaid - 0.004) {
    res.status(400).json({ error: '已付 U 不能减少，请用结款记录继续结款' });
    return;
  }
  const paymentDelta = round2(newPaid - oldPaid);
  const now = new Date().toISOString();
  db.transaction(() => {
    db.prepare(
      `UPDATE product_shipments
       SET unit_price = ?, rmb_amount = ?, freight = ?, exchange_rate = ?, buy_rate = ?, sell_rate = ?, fee = ?,
           u_amount = ?, exchange_loss = ?, u_paid = ?, unpaid_u = ?, cost_amount = ?, updated_at = ?
       WHERE id = ?`
    ).run(
      values.unit_price ?? 0,
      values.rmb_amount ?? 0,
      values.freight ?? 0,
      values.exchange_rate ?? null,
      values.buy_rate ?? null,
      values.sell_rate ?? null,
      values.fee ?? 0,
      values.u_amount ?? 0,
      values.exchange_loss ?? null,
      values.u_paid ?? 0,
      values.unpaid_u ?? 0,
      values.cost_amount ?? 0,
      now,
      shipmentId
    );
    if (paymentDelta > 0.004) {
      db.prepare(
        'INSERT INTO shipment_payments (shipment_id, amount, created_at) VALUES (?, ?, ?)'
      ).run(shipmentId, paymentDelta, now);
    }
  })();
  const shipment = db
    .prepare('SELECT * FROM product_shipments WHERE id = ?')
    .get(shipmentId) as Record<string, unknown>;
  res.json({ shipment: shipmentView(shipment) });
});

/** 继续结款：追加一笔已付 U */
router.post('/:id/shipments/:shipmentId/payments', (req, res) => {
  const productId = Number(req.params.id);
  const shipmentId = Number(req.params.shipmentId);
  const current = db
    .prepare('SELECT * FROM product_shipments WHERE id = ? AND product_id = ?')
    .get(shipmentId, productId) as Record<string, unknown> | undefined;
  if (!current) {
    res.status(404).json({ error: '发货记录不存在' });
    return;
  }
  const amount = Number((req.body ?? {}).amount ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: '结款金额必须大于 0' });
    return;
  }
  const now = new Date().toISOString();
  const newPaid = round2(Number(current.u_paid) + amount);
  const unpaid = round2(Number(current.u_amount) - newPaid);
  db.transaction(() => {
    db.prepare(
      'INSERT INTO shipment_payments (shipment_id, amount, created_at) VALUES (?, ?, ?)'
    ).run(shipmentId, amount, now);
    db.prepare(
      'UPDATE product_shipments SET u_paid = ?, unpaid_u = ?, updated_at = ? WHERE id = ?'
    ).run(newPaid, unpaid, now, shipmentId);
  })();
  const shipment = db
    .prepare('SELECT * FROM product_shipments WHERE id = ?')
    .get(shipmentId) as Record<string, unknown>;
  res.status(201).json({ shipment: shipmentView(shipment) });
});

/** 修改某个客户的预订单 */
router.patch('/:id/preorders/:preorderId', (req, res) => {
  const productId = Number(req.params.id);
  const preorderId = Number(req.params.preorderId);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
    | ProductRow
    | undefined;
  if (!product) {
    res.status(404).json({ error: '产品不存在' });
    return;
  }
  const preorder = db
    .prepare('SELECT * FROM preorders WHERE id = ? AND product_name = ?')
    .get(preorderId, product.name) as
    | { id: number; batch_id: number; unit_price: number; date: string | null }
    | undefined;
  if (!preorder) {
    res.status(404).json({ error: '预订单不存在' });
    return;
  }
  const body = (req.body ?? {}) as {
    customerName?: string;
    unitPrice?: number;
    items?: Array<{ flavor?: string; quantity?: number }>;
  };
  const customerName =
    typeof body.customerName === 'string' ? body.customerName.trim() : '';
  const unitPrice = Number(body.unitPrice ?? preorder.unit_price);
  if (!customerName) {
    res.status(400).json({ error: '请输入客户名字' });
    return;
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    res.status(400).json({ error: '价格不能为负数' });
    return;
  }
  const flavors = db
    .prepare('SELECT * FROM product_flavors WHERE product_id = ? ORDER BY id')
    .all(productId) as FlavorRow[];
  const flavorMap = new Map(flavors.map((flavor) => [flavor.flavor, flavor]));
  const quantities = new Map<string, number>();
  for (const item of body.items ?? []) {
    const flavor = typeof item.flavor === 'string' ? item.flavor.trim() : '';
    const quantity = Number(item.quantity ?? 0);
    if (!flavor) continue;
    if (!flavorMap.has(flavor)) {
      res.status(400).json({ error: `口味「${flavor}」不存在` });
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    quantities.set(flavor, round2((quantities.get(flavor) ?? 0) + quantity));
  }
  if (quantities.size === 0) {
    res.status(400).json({ error: '请至少填写一个口味的数量' });
    return;
  }
  const totalQuantity = round2(
    [...quantities.values()].reduce((sum, qty) => sum + qty, 0)
  );

  db.transaction(() => {
    const now = new Date().toISOString();
    db.prepare(
      'DELETE FROM plan_bookings WHERE preorder_id = ?'
    ).run(preorderId);
    db.prepare(
      'UPDATE preorders SET customer_name = ?, unit_price = ?, total_quantity = ?, updated_at = ? WHERE id = ?'
    ).run(customerName, unitPrice, totalQuantity, now, preorderId);

    const findPlan = db.prepare(
      'SELECT id, unit_price FROM plans WHERE batch_id = ? AND flavor = ?'
    );
    const insertPlan = db.prepare(
      'INSERT INTO plans (batch_id, product_name, flavor, quantity, unit_price, amount, remark, created_at, updated_at) VALUES (?, ?, ?, 0, 0, 0, NULL, ?, ?)'
    );
    const insertBooking = db.prepare(
      'INSERT INTO plan_bookings (plan_id, batch_id, customer_name, quantity, preorder_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );
    for (const [flavor, quantity] of quantities) {
      let plan = findPlan.get(preorder.batch_id, flavor) as
        | { id: number; unit_price: number }
        | undefined;
      if (!plan) {
        const info = insertPlan.run(preorder.batch_id, product.name, flavor, now, now);
        plan = { id: Number(info.lastInsertRowid), unit_price: 0 };
      }
      if (Number(plan.unit_price) <= 0 && unitPrice > 0) {
        db.prepare('UPDATE plans SET unit_price = ?, updated_at = ? WHERE id = ?').run(
          unitPrice,
          now,
          plan.id
        );
      }
      insertBooking.run(
        plan.id,
        preorder.batch_id,
        customerName,
        quantity,
        preorderId,
        now,
        now
      );
    }

    const plans = db
      .prepare('SELECT id, unit_price FROM plans WHERE batch_id = ?')
      .all(preorder.batch_id) as Array<{ id: number; unit_price: number }>;
    const sumBookings = db.prepare(
      'SELECT COALESCE(SUM(quantity), 0) AS qty FROM plan_bookings WHERE plan_id = ?'
    );
    const updatePlan = db.prepare(
      'UPDATE plans SET quantity = ?, amount = ?, updated_at = ? WHERE id = ?'
    );
    for (const plan of plans) {
      const row = sumBookings.get(plan.id) as { qty: number };
      const quantity = round2(row.qty);
      updatePlan.run(
        quantity,
        planAmount(quantity, Number(plan.unit_price)),
        now,
        plan.id
      );
    }
  })();

  const updated = db.prepare('SELECT * FROM preorders WHERE id = ?').get(preorderId);
  const items = db
    .prepare(
      `SELECT p.flavor, pb.quantity
       FROM plan_bookings pb JOIN plans p ON p.id = pb.plan_id
       WHERE pb.preorder_id = ? ORDER BY pb.id`
    )
    .all(preorderId);
  res.json({ preorder: { ...(updated as object), items } });
});

router.post('/:id/flavors/:flavorId/order', (req, res) => {
  const productId = Number(req.params.id);
  const flavorId = Number(req.params.flavorId);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
    | ProductRow
    | undefined;
  const flavor = db
    .prepare('SELECT * FROM product_flavors WHERE id = ? AND product_id = ?')
    .get(flavorId, productId) as FlavorRow | undefined;
  if (!product || !flavor) {
    res.status(404).json({ error: '产品或口味不存在' });
    return;
  }
  const body = (req.body ?? {}) as { batchName?: string; date?: string };
  const date =
    typeof body.date === 'string' && body.date.trim()
      ? body.date.trim()
      : new Date().toISOString().slice(0, 10);
  const batchName =
    typeof body.batchName === 'string' && body.batchName.trim()
      ? body.batchName.trim()
      : `${product.name} ${date}`;
  const now = new Date().toISOString();
  const batchInfo = db
    .prepare(
      'INSERT INTO batches (name, date, expected_arrival_date, remark, status, created_at, updated_at) VALUES (?, ?, ?, NULL, ?, ?, ?)'
    )
    .run(batchName, date, null, '待到货', now, now);
  const batchId = Number(batchInfo.lastInsertRowid);
  const planInfo = db
    .prepare(
      'INSERT INTO plans (batch_id, product_name, flavor, quantity, unit_price, amount, remark, created_at, updated_at) VALUES (?, ?, ?, 0, ?, 0, NULL, ?, ?)'
    )
    .run(batchId, product.name, flavor.flavor, flavor.price, now, now);
  res.status(201).json({
    batch_id: batchId,
    plan_id: Number(planInfo.lastInsertRowid),
    batch_name: batchName,
  });
});

/** 入库：给该口味最新的订单登记到货，增加仓库库存 */
/** 批量入库：供应商 + 统一入库价 + 各口味数量 */
router.post('/:id/stock-in', (req, res) => {
  const productId = Number(req.params.id);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
    | ProductRow
    | undefined;
  if (!product) {
    res.status(404).json({ error: '产品不存在' });
    return;
  }
  const body = (req.body ?? {}) as {
    supplierName?: string;
    unitPrice?: number;
    date?: string;
    items?: Array<{ flavor?: string; quantity?: number }>;
  };
  const supplierName =
    typeof body.supplierName === 'string' ? body.supplierName.trim() : '';
  const unitPrice = Number(body.unitPrice ?? 0);
  const date =
    typeof body.date === 'string' && body.date.trim()
      ? body.date.trim()
      : new Date().toISOString().slice(0, 10);
  if (!supplierName) {
    res.status(400).json({ error: '请输入供应商名字' });
    return;
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    res.status(400).json({ error: '入库价格不能为负数' });
    return;
  }
  const flavors = db
    .prepare('SELECT * FROM product_flavors WHERE product_id = ? ORDER BY id')
    .all(productId) as FlavorRow[];
  if (flavors.length === 0) {
    res.status(400).json({ error: '该产品暂无口味，请先添加口味' });
    return;
  }
  const flavorMap = new Map(flavors.map((flavor) => [flavor.flavor, flavor]));
  const quantities = new Map<string, number>();
  for (const item of body.items ?? []) {
    const flavor = typeof item.flavor === 'string' ? item.flavor.trim() : '';
    const quantity = Number(item.quantity ?? 0);
    if (!flavor) continue;
    if (!flavorMap.has(flavor)) {
      res.status(400).json({ error: `口味「${flavor}」不存在` });
      return;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    quantities.set(flavor, round2((quantities.get(flavor) ?? 0) + quantity));
  }
  if (quantities.size === 0) {
    res.status(400).json({ error: '请至少填写一个口味的数量' });
    return;
  }

  const findPlan = db.prepare(
    `SELECT p.id, p.batch_id
     FROM plans p JOIN batches b ON b.id = p.batch_id
     WHERE p.product_name = ? AND p.flavor = ? AND b.status != '已归档'
     ORDER BY p.id DESC LIMIT 1`
  );
  const plans = new Map<string, { id: number; batch_id: number }>();
  const missing: string[] = [];
  for (const flavor of quantities.keys()) {
    const plan = findPlan.get(product.name, flavor) as
      | { id: number; batch_id: number }
      | undefined;
    if (plan) plans.set(flavor, plan);
    else missing.push(flavor);
  }
  if (missing.length > 0) {
    res.status(400).json({ error: `以下口味还没有预定：${missing.join('、')}` });
    return;
  }

  const now = new Date().toISOString();
  const batchIds = new Set<number>();
  const insert = db.prepare(
    'INSERT INTO arrival_records (batch_id, plan_id, date, quantity, unit_price, amount, supplier, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
  );
  let totalQuantity = 0;
  const result = db.transaction(() => {
    const rows: Array<{ flavor: string; quantity: number }> = [];
    for (const [flavor, quantity] of quantities) {
      const plan = plans.get(flavor);
      if (!plan) continue;
      insert.run(
        plan.batch_id,
        plan.id,
        date,
        quantity,
        unitPrice,
        arrivalAmount(quantity, unitPrice),
        supplierName,
        '仓库入库',
        now,
        now
      );
      batchIds.add(plan.batch_id);
      totalQuantity = round2(totalQuantity + quantity);
      rows.push({ flavor, quantity });
    }
    return rows;
  })();

  for (const batchId of batchIds) {
    refreshBatchStatus(batchId);
  }

  res.status(201).json({
    supplier_name: supplierName,
    unit_price: unitPrice,
    date,
    total_quantity: totalQuantity,
    items: result,
  });
});

router.post('/:id/flavors/:flavorId/stock-in', (req, res) => {
  const productId = Number(req.params.id);
  const flavorId = Number(req.params.flavorId);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId) as
    | ProductRow
    | undefined;
  const flavor = db
    .prepare('SELECT * FROM product_flavors WHERE id = ? AND product_id = ?')
    .get(flavorId, productId) as FlavorRow | undefined;
  if (!product || !flavor) {
    res.status(404).json({ error: '产品或口味不存在' });
    return;
  }
  const body = (req.body ?? {}) as { quantity?: number; unitPrice?: number; date?: string };
  const quantity = Number(body.quantity ?? 0);
  const unitPrice = Number(body.unitPrice ?? 0);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    res.status(400).json({ error: '入库数量必须大于 0' });
    return;
  }
  if (!Number.isFinite(unitPrice) || unitPrice < 0) {
    res.status(400).json({ error: '入库单价不能为负数' });
    return;
  }
  const plan = db
    .prepare(
      `SELECT p.id, p.batch_id
       FROM plans p JOIN batches b ON b.id = p.batch_id
       WHERE p.product_name = ? AND p.flavor = ? AND b.status != '已归档'
       ORDER BY p.id DESC LIMIT 1`
    )
    .get(product.name, flavor.flavor) as { id: number; batch_id: number } | undefined;
  if (!plan) {
    res.status(400).json({ error: '该口味还没有订单，请先预定' });
    return;
  }
  const now = new Date().toISOString();
  db.prepare(
    'INSERT INTO arrival_records (batch_id, plan_id, date, quantity, unit_price, amount, remark, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(
    plan.batch_id,
    plan.id,
    body.date ?? null,
    quantity,
    unitPrice,
    arrivalAmount(quantity, unitPrice),
    '仓库入库',
    now,
    now
  );
  refreshBatchStatus(plan.batch_id);
  res.status(201).json({ stock: stockFor(product.name, flavor.flavor) });
});

export default router;
