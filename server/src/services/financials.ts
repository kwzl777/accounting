import { db } from '../db.js';
import { exchangeLoss, remainingDebt, round2, type ProfitBasis } from '../calc.js';

/** 批次内某张表某列的合计（表名/列名仅由服务端内部常量传入） */
export function sumOf(batchId: number, table: string, column: string): number {
  const row = db
    .prepare(`SELECT COALESCE(SUM(${column}), 0) AS s FROM ${table} WHERE batch_id = ?`)
    .get(batchId) as { s: number };
  return round2(row.s);
}

export interface BatchFinancials {
  salesAmount: number;
  receivedAmount: number;
  waivedAmount: number;
  actualCost: number;
  expenses: number;
  exchangeLoss: number;
}

/** 批次财务汇总：销售额 / 实收 / 甩零 / 实际进货成本 / 费用 / U 币兑换亏损 */
export function getBatchFinancials(batchId: number): BatchFinancials {
  const salesAmount = sumOf(batchId, 'shipments', 'sales_amount');
  const receivedAmount = sumOf(batchId, 'receipts', 'amount');
  const waivedAmount = sumOf(batchId, 'shipments', 'waived_amount');
  // 进货成本以发货结算里填写的“进货价”为准（含运费、汇率损耗）
  const actualCost = sumOf(batchId, 'product_shipments', 'cost_amount');
  const expenses = sumOf(batchId, 'expenses', 'amount');

  const exchanges = db
    .prepare('SELECT rmb_amount, buy_rate, settle_rate FROM currency_exchanges WHERE batch_id = ?')
    .all(batchId) as Array<{
    rmb_amount: number;
    buy_rate: number | null;
    settle_rate: number | null;
  }>;
  let exchangeLossTotal = 0;
  for (const exchange of exchanges) {
    const loss = exchangeLoss({
      rmbAmount: exchange.rmb_amount,
      buyRate: exchange.buy_rate,
      sellRate: exchange.settle_rate,
    });
    if (loss !== null) {
      exchangeLossTotal = round2(exchangeLossTotal + loss);
    }
  }

  return { salesAmount, receivedAmount, waivedAmount, actualCost, expenses, exchangeLoss: exchangeLossTotal };
}

/** 当前利润口径固定为实收（cash） */
export function getProfitBasis(): ProfitBasis {
  return 'cash';
}

/** 批次应收欠款 = 各出货剩余欠款（销售金额 − 免收 − 累计已收）合计 */
export function getBatchReceivable(batchId: number): number {
  const shipments = db
    .prepare('SELECT id, sales_amount, waived_amount FROM shipments WHERE batch_id = ?')
    .all(batchId) as Array<{ id: number; sales_amount: number; waived_amount: number }>;
  let remaining = 0;
  for (const shipment of shipments) {
    const received = (
      db
        .prepare('SELECT COALESCE(SUM(amount), 0) AS s FROM receipts WHERE shipment_id = ?')
        .get(shipment.id) as { s: number }
    ).s;
    remaining = round2(
      remaining + remainingDebt(shipment.sales_amount, shipment.waived_amount, received)
    );
  }
  return remaining;
}
