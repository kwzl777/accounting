/**
 * 核心计算函数：服务端唯一可信实现。
 *
 * 说明：当前阶段金额以「元」为单位（保留两位小数）。
 * 后续涉及结算、分红分币时会切换为整数分（分）计算，避免二进制浮点误差。
 */

/** 保留两位小数，避免二进制浮点误差累积 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** 预定金额 = 预定数量 × 预定单价 */
export function planAmount(quantity: number, unitPrice: number): number {
  return round2(quantity * unitPrice);
}

/** 实际到货金额 = 实际到货数量 × 实际到货单价 */
export function arrivalAmount(quantity: number, unitPrice: number): number {
  return round2(quantity * unitPrice);
}

/** 缺货数量 = max(预定数量 − 实际到货数量, 0) */
export function shortage(plannedQty: number, actualQty: number): number {
  return Math.max(round2(plannedQty - actualQty), 0);
}

/** 多到数量 = max(实际到货数量 − 预定数量, 0) */
export function overage(plannedQty: number, actualQty: number): number {
  return Math.max(round2(actualQty - plannedQty), 0);
}

/** 剩余欠款 = max(销售金额 − 确认免收金额 − 累计已收款, 0) */
export function remainingDebt(
  salesAmount: number,
  waivedAmount: number,
  receivedAmount: number
): number {
  return Math.max(round2(salesAmount - waivedAmount - receivedAmount), 0);
}

/** 实际平均单价 = 实际到货总金额 ÷ 实际到货总数量（总数量为 0 时返回 null） */
export function avgUnitPrice(totalAmount: number, totalQuantity: number): number | null {
  if (totalQuantity <= 0) return null;
  return round2(totalAmount / totalQuantity);
}

/** 销售金额 = 出货数量 × 销售单价 */
export function salesAmount(quantity: number, unitPrice: number): number {
  return round2(quantity * unitPrice);
}

export type DebtStatus = '未收款' | '部分收款' | '已结清';

/** 欠款状态：未收款 / 部分收款 / 已结清 */
export function debtStatus(sales: number, waived: number, received: number): DebtStatus {
  const remaining = remainingDebt(sales, waived, received);
  if (remaining <= 0) return '已结清';
  if (received <= 0) return '未收款';
  return '部分收款';
}

export interface ExchangeLossInput {
  rmbAmount: number;
  buyRate: number | null;
  sellRate: number | null;
}

/**
 * U 币兑换亏损（用户确认公式）：
 * 亏损 = 本金 × (买进汇率 − 卖出汇率) ÷ 买进汇率
 * 返回正数表示亏损；负数表示兑换收益（负亏损），按实际记录，不强制归零。
 * 缺少买进/卖出汇率，或买进汇率为 0 时返回 null（无法计算）。
 */
export function exchangeLoss(input: ExchangeLossInput): number | null {
  const { rmbAmount, buyRate, sellRate } = input;
  if (buyRate === null || sellRate === null) return null;
  if (!Number.isFinite(buyRate) || !Number.isFinite(sellRate) || buyRate === 0) return null;
  return round2((rmbAmount * (buyRate - sellRate)) / buyRate);
}

export type ProfitBasis = 'cash' | 'receivable';
export interface BatchProfitInput {
  /** cash = 实收口径；receivable = 应收（销售金额）口径 */
  basis: ProfitBasis;
  salesAmount: number;
  receivedAmount: number;
  actualCost: number;
  expenses: number;
  /** 历史字段，U 币损耗已包含在 actualCost 里，不再单独扣减 */
  exchangeLoss?: number;
}

/**
 * 批次毛利润：
 * 毛利润 = 实收总额（已收 + 甩零） − 拿货成本（含运费、U 损耗） − 费用
 * basis 仅保留兼容旧调用；业务上固定按实收。
 */
export function batchProfit(input: BatchProfitInput): number {
  const revenue = input.basis === 'cash' ? input.receivedAmount : input.salesAmount;
  return round2(revenue - input.actualCost - input.expenses);
}

/**
 * 按出资金额比例分配分红（整数分计算 + 最大余数法）。
 * 返回每个人应分金额（元，两位小数），保证合计严格等于分红总额。
 * 出资总额为 0 或分红总额 <= 0 时全部返回 0。
 */
export function allocateShares(totalAmount: number, contributions: number[]): number[] {
  const totalCents = Math.round(round2(totalAmount) * 100);
  const contributionCents = contributions.map((value) => Math.round(round2(value) * 100));
  const totalContribution = contributionCents.reduce((sum, value) => sum + value, 0);
  if (totalContribution <= 0 || totalCents <= 0) {
    return contributions.map(() => 0);
  }
  const quotas = contributionCents.map((value) => (totalCents * value) / totalContribution);
  const shares = quotas.map((value) => Math.floor(value));
  let remaining = totalCents - shares.reduce((sum, value) => sum + value, 0);
  const order = quotas
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (let i = 0; i < order.length && remaining > 0; i += 1) {
    shares[order[i].index] += 1;
    remaining -= 1;
  }
  return shares.map((value) => round2(value / 100));
}
