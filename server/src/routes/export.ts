import { Router } from 'express';
import ExcelJS from 'exceljs';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';
import { batchProfit, remainingDebt, debtStatus, round2, exchangeLoss } from '../calc.js';
import {
  getBatchFinancials,
  getBatchReceivable,
  getProfitBasis,
} from '../services/financials.js';

const router = Router();

router.use(requireAuth);

function prepareSheet(workbook: ExcelJS.Workbook, name: string, columns: Partial<ExcelJS.Column>[]) {
  const sheet = workbook.addWorksheet(name);
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };
  return sheet;
}

interface Row {
  [key: string]: unknown;
}

router.get('/excel', async (_req, res) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '个人经营账本';
  workbook.created = new Date();

  const basis = getProfitBasis();
  const batches = db.prepare('SELECT * FROM batches ORDER BY id').all() as Row[];
  const plans = db
    .prepare(
      'SELECT p.*, b.name AS batch_name FROM plans p JOIN batches b ON b.id = p.batch_id ORDER BY p.batch_id, p.id'
    )
    .all() as Row[];
  const arrivals = db.prepare('SELECT * FROM arrival_records').all() as Row[];
  const shipments = db
    .prepare(
      'SELECT s.*, b.name AS batch_name FROM shipments s JOIN batches b ON b.id = s.batch_id ORDER BY s.batch_id, s.id'
    )
    .all() as Row[];
  const receipts = db
    .prepare(
      'SELECT r.*, s.customer_name, b.name AS batch_name FROM receipts r JOIN shipments s ON s.id = r.shipment_id JOIN batches b ON b.id = r.batch_id ORDER BY r.id'
    )
    .all() as Row[];
  const expenses = db
    .prepare('SELECT e.*, b.name AS batch_name FROM expenses e JOIN batches b ON b.id = e.batch_id ORDER BY e.id')
    .all() as Row[];
  const exchanges = db
    .prepare(
      'SELECT e.*, b.name AS batch_name FROM currency_exchanges e JOIN batches b ON b.id = e.batch_id ORDER BY e.id'
    )
    .all() as Row[];
  const allocations = db
    .prepare(
      'SELECT a.*, d.status AS dividend_status, b.name AS batch_name FROM dividend_allocations a JOIN dividends d ON d.id = a.dividend_id JOIN batches b ON b.id = d.batch_id ORDER BY a.id'
    )
    .all() as Row[];

  const arrivalByPlan = new Map<number, { quantity: number; amount: number }>();
  for (const arrival of arrivals) {
    const planId = Number(arrival.plan_id);
    const entry = arrivalByPlan.get(planId) ?? { quantity: 0, amount: 0 };
    entry.quantity = round2(entry.quantity + Number(arrival.quantity));
    entry.amount = round2(entry.amount + Number(arrival.amount));
    arrivalByPlan.set(planId, entry);
  }

  const receiptByShipment = new Map<number, number>();
  for (const receipt of receipts) {
    const shipmentId = Number(receipt.shipment_id);
    receiptByShipment.set(
      shipmentId,
      round2((receiptByShipment.get(shipmentId) ?? 0) + Number(receipt.amount))
    );
  }

  // 1. 批次汇总
  const summarySheet = prepareSheet(workbook, '批次汇总', [
    { header: '批次ID', key: 'id', width: 8 },
    { header: '批次名称', key: 'name', width: 24 },
    { header: '日期', key: 'date', width: 12 },
    { header: '状态', key: 'status', width: 10 },
    { header: '预定总金额', key: 'planned_total', width: 14 },
    { header: '实际到货金额', key: 'arrival_total', width: 14 },
    { header: '出货销售额', key: 'sales_amount', width: 14 },
    { header: '出货实收（含甩零）', key: 'received_amount', width: 14 },
    { header: '经营费用', key: 'expenses', width: 12 },
    { header: 'U币兑换亏损', key: 'exchange_loss', width: 14 },
    { header: '经营利润', key: 'profit', width: 14 },
    { header: '已确认分红', key: 'dividend_total', width: 14 },
    { header: '已兑付分红', key: 'dividend_paid', width: 14 },
    { header: '应收欠款', key: 'receivable', width: 14 },
  ]);

  for (const batch of batches) {
    const batchId = Number(batch.id);
    const financials = getBatchFinancials(batchId);
    const settledAmount = round2(
      financials.receivedAmount + financials.waivedAmount
    );
    const profit = batchProfit({
      basis,
      salesAmount: financials.salesAmount,
      receivedAmount: settledAmount,
      actualCost: financials.actualCost,
      expenses: financials.expenses,
    });
    const plannedTotal = round2(
      (
        db
          .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM plans WHERE batch_id = ?')
          .get(batchId) as { s: number }
      ).s
    );
    const dividend = db
      .prepare('SELECT id, total_amount, status FROM dividends WHERE batch_id = ?')
      .get(batchId) as { id: number; total_amount: number; status: string } | undefined;
    const dividendTotal =
      dividend && dividend.status === 'confirmed' ? round2(dividend.total_amount) : 0;
    const dividendPaid = dividend
      ? round2(
          (
            db
              .prepare(
                `SELECT COALESCE(SUM(p.amount), 0) AS s FROM dividend_payments p
                 JOIN dividend_allocations a ON a.id = p.allocation_id WHERE a.dividend_id = ?`
              )
              .get(dividend.id) as { s: number }
          ).s
        )
      : 0;

    summarySheet.addRow({
      id: batchId,
      name: batch.name,
      date: batch.date,
      status: batch.status,
      planned_total: plannedTotal,
      arrival_total: financials.actualCost,
      sales_amount: financials.salesAmount,
      received_amount: settledAmount,
      expenses: financials.expenses,
      exchange_loss: financials.exchangeLoss,
      profit,
      dividend_total: dividendTotal,
      dividend_paid: dividendPaid,
      receivable: getBatchReceivable(batchId),
    });
  }

  // 2. 预定/到货明细
  const planSheet = prepareSheet(workbook, '预定到货明细', [
    { header: '批次', key: 'batch_name', width: 24 },
    { header: '产品', key: 'product_name', width: 16 },
    { header: '口味', key: 'flavor', width: 16 },
    { header: '预定数量', key: 'planned_quantity', width: 12 },
    { header: '预定单价', key: 'planned_unit_price', width: 12 },
    { header: '预定金额', key: 'planned_amount', width: 14 },
    { header: '实际到货数量', key: 'actual_quantity', width: 14 },
    { header: '实际金额', key: 'actual_amount', width: 14 },
    { header: '平均单价', key: 'avg_unit_price', width: 12 },
    { header: '缺货数量', key: 'shortage', width: 12 },
    { header: '多到数量', key: 'overage', width: 12 },
  ]);

  for (const plan of plans) {
    const actual = arrivalByPlan.get(Number(plan.id)) ?? { quantity: 0, amount: 0 };
    planSheet.addRow({
      batch_name: plan.batch_name,
      product_name: plan.product_name,
      flavor: plan.flavor,
      planned_quantity: plan.quantity,
      planned_unit_price: plan.unit_price,
      planned_amount: plan.amount,
      actual_quantity: actual.quantity,
      actual_amount: actual.amount,
      avg_unit_price: actual.quantity > 0 ? round2(actual.amount / actual.quantity) : '',
      shortage: Math.max(round2(Number(plan.quantity) - actual.quantity), 0),
      overage: Math.max(round2(actual.quantity - Number(plan.quantity)), 0),
    });
  }

  // 3. 出货收款
  const shipmentSheet = prepareSheet(workbook, '出货收款', [
    { header: '批次', key: 'batch_name', width: 24 },
    { header: '客户', key: 'customer_name', width: 16 },
    { header: '日期', key: 'date', width: 12 },
    { header: '产品', key: 'product_name', width: 14 },
    { header: '口味', key: 'flavor', width: 14 },
    { header: '数量', key: 'quantity', width: 10 },
    { header: '销售单价', key: 'unit_price', width: 12 },
    { header: '销售金额', key: 'sales_amount', width: 14 },
    { header: '免收金额', key: 'waived_amount', width: 12 },
    { header: '已收金额', key: 'received_amount', width: 14 },
    { header: '剩余欠款', key: 'remaining_amount', width: 14 },
    { header: '欠款状态', key: 'status', width: 12 },
  ]);

  for (const shipment of shipments) {
    const received = receiptByShipment.get(Number(shipment.id)) ?? 0;
    const remaining = remainingDebt(
      Number(shipment.sales_amount),
      Number(shipment.waived_amount),
      received
    );
    shipmentSheet.addRow({
      batch_name: shipment.batch_name,
      customer_name: shipment.customer_name,
      date: shipment.date,
      product_name: shipment.product_name,
      flavor: shipment.flavor,
      quantity: shipment.quantity,
      unit_price: shipment.unit_price,
      sales_amount: shipment.sales_amount,
      waived_amount: shipment.waived_amount,
      received_amount: received,
      remaining_amount: remaining,
      status: debtStatus(
        Number(shipment.sales_amount),
        Number(shipment.waived_amount),
        received
      ),
    });
  }

  // 4. 收款明细
  const receiptSheet = prepareSheet(workbook, '收款明细', [
    { header: '批次', key: 'batch_name', width: 24 },
    { header: '客户', key: 'customer_name', width: 16 },
    { header: '收款日期', key: 'date', width: 12 },
    { header: '收款金额', key: 'amount', width: 14 },
    { header: '备注', key: 'remark', width: 24 },
  ]);
  for (const receipt of receipts) {
    receiptSheet.addRow({
      batch_name: receipt.batch_name,
      customer_name: receipt.customer_name,
      date: receipt.date,
      amount: receipt.amount,
      remark: receipt.remark,
    });
  }

  // 5. 费用明细
  const expenseSheet = prepareSheet(workbook, '费用明细', [
    { header: '批次', key: 'batch_name', width: 24 },
    { header: '日期', key: 'date', width: 12 },
    { header: '类别', key: 'category', width: 12 },
    { header: '金额', key: 'amount', width: 12 },
    { header: '说明', key: 'description', width: 30 },
  ]);
  for (const expense of expenses) {
    expenseSheet.addRow({
      batch_name: expense.batch_name,
      date: expense.date,
      category: expense.category,
      amount: expense.amount,
      description: expense.description,
    });
  }

  // 6. U币兑换
  const exchangeSheet = prepareSheet(workbook, 'U币兑换', [
    { header: '批次', key: 'batch_name', width: 24 },
    { header: '日期', key: 'date', width: 12 },
    { header: '本金', key: 'rmb_amount', width: 14 },
    { header: 'U币数量', key: 'usd_amount', width: 12 },
    { header: '买进汇率', key: 'buy_rate', width: 12 },
    { header: '卖出汇率', key: 'settle_rate', width: 12 },
    { header: '手续费', key: 'fee', width: 12 },
    { header: '亏损', key: 'loss', width: 14 },
    { header: '备注', key: 'remark', width: 24 },
  ]);
  for (const exchange of exchanges) {
    const loss = exchangeLoss({
      rmbAmount: Number(exchange.rmb_amount),
      buyRate: exchange.buy_rate === null ? null : Number(exchange.buy_rate),
      sellRate: exchange.settle_rate === null ? null : Number(exchange.settle_rate),
    });
    exchangeSheet.addRow({
      batch_name: exchange.batch_name,
      date: exchange.date,
      rmb_amount: exchange.rmb_amount,
      usd_amount: exchange.usd_amount,
      buy_rate: exchange.buy_rate,
      settle_rate: exchange.settle_rate,
      fee: exchange.fee,
      loss: loss === null ? '无法计算' : loss,
      remark: exchange.remark,
    });
  }

  // 7. 分红明细
  const dividendSheet = prepareSheet(workbook, '分红明细', [
    { header: '批次', key: 'batch_name', width: 24 },
    { header: '分红状态', key: 'dividend_status', width: 12 },
    { header: '出资人', key: 'investor_name', width: 14 },
    { header: '出资金额', key: 'contribution_amount', width: 14 },
    { header: '占比', key: 'ratio', width: 10 },
    { header: '应分金额', key: 'share_amount', width: 14 },
    { header: '已兑付', key: 'paid_amount', width: 12 },
    { header: '未兑付', key: 'unpaid_amount', width: 12 },
  ]);
  for (const allocation of allocations) {
    const paid = round2(
      (
        db
          .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM dividend_payments WHERE allocation_id = ?')
          .get(Number(allocation.id)) as { s: number }
      ).s
    );
    dividendSheet.addRow({
      batch_name: allocation.batch_name,
      dividend_status: allocation.dividend_status === 'confirmed' ? '已确认' : '草稿',
      investor_name: allocation.investor_name,
      contribution_amount: allocation.contribution_amount,
      ratio: allocation.ratio,
      share_amount: allocation.share_amount,
      paid_amount: paid,
      unpaid_amount: Math.max(round2(Number(allocation.share_amount) - paid), 0),
    });
  }

  const filename = `ledger-${new Date().toISOString().slice(0, 10)}.xlsx`;
  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await workbook.xlsx.write(res);
  res.end();
});

export default router;
