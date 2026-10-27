import { describe, it, expect } from 'vitest';
import {
  planAmount,
  arrivalAmount,
  shortage,
  overage,
  remainingDebt,
  avgUnitPrice,
  salesAmount,
  debtStatus,
  exchangeLoss,
  batchProfit,
  allocateShares,
  round2,
} from './calc.js';

describe('预定 / 实际到货金额', () => {
  it('预定 2000 × 35 = 70000（PRD 验收用例）', () => {
    expect(planAmount(2000, 35)).toBe(70000);
  });

  it('实际到货 1800 × 37 = 66600（PRD 验收用例）', () => {
    expect(arrivalAmount(1800, 37)).toBe(66600);
  });

  it('保留两位小数', () => {
    expect(planAmount(3, 0.1)).toBe(0.3);
  });
});

describe('缺货 / 多到数量', () => {
  it('缺货 2000 − 1800 = 200', () => {
    expect(shortage(2000, 1800)).toBe(200);
  });

  it('到足或缺货时为 0', () => {
    expect(shortage(1800, 1800)).toBe(0);
    expect(shortage(1800, 2000)).toBe(0);
  });

  it('多到 2100 − 2000 = 100', () => {
    expect(overage(2000, 2100)).toBe(100);
  });

  it('未多到时为 0', () => {
    expect(overage(2000, 1800)).toBe(0);
  });
});

describe('剩余欠款', () => {
  it('288000 − 3000 − 280000 = 5000（PRD 验收用例）', () => {
    expect(remainingDebt(288000, 3000, 280000)).toBe(5000);
  });

  it('不会出现负数', () => {
    expect(remainingDebt(1000, 0, 1200)).toBe(0);
  });
});

describe('实际平均单价', () => {
  it('66600 ÷ 1800 = 37', () => {
    expect(avgUnitPrice(66600, 1800)).toBe(37);
  });

  it('总数量为 0 时返回 null', () => {
    expect(avgUnitPrice(0, 0)).toBeNull();
  });
});

describe('销售金额与欠款状态', () => {
  it('出货 100 × 2880 = 288000', () => {
    expect(salesAmount(100, 2880)).toBe(288000);
  });

  it('有欠款且未收款 → 未收款', () => {
    expect(debtStatus(288000, 3000, 0)).toBe('未收款');
  });

  it('部分收款（PRD 验收用例：应收 288000 − 免收 3000 − 已收 280000 = 欠款 5000）', () => {
    expect(debtStatus(288000, 3000, 280000)).toBe('部分收款');
    expect(remainingDebt(288000, 3000, 280000)).toBe(5000);
  });

  it('已结清', () => {
    expect(debtStatus(288000, 3000, 285000)).toBe('已结清');
  });
});

describe('U 币兑换亏损（公式：本金 × (买进汇率 − 卖出汇率) ÷ 买进汇率）', () => {
  it('7000 × (7.0 − 6.9) ÷ 7.0 = 100', () => {
    expect(exchangeLoss({ rmbAmount: 7000, buyRate: 7.0, sellRate: 6.9 })).toBe(100);
  });

  it('6900 × (6.9 − 7.0) ÷ 6.9 = -100（兑换收益）', () => {
    expect(exchangeLoss({ rmbAmount: 6900, buyRate: 6.9, sellRate: 7.0 })).toBe(-100);
  });

  it('买卖汇率相同时无亏损', () => {
    expect(exchangeLoss({ rmbAmount: 7000, buyRate: 7.0, sellRate: 7.0 })).toBe(0);
  });

  it('缺少汇率时无法计算', () => {
    expect(exchangeLoss({ rmbAmount: 7000, buyRate: null, sellRate: 6.9 })).toBeNull();
    expect(exchangeLoss({ rmbAmount: 7000, buyRate: 7.0, sellRate: null })).toBeNull();
  });

  it('买进汇率为 0 时无法计算', () => {
    expect(exchangeLoss({ rmbAmount: 7000, buyRate: 0, sellRate: 6.9 })).toBeNull();
  });

  const realCase = exchangeLoss({ rmbAmount: 110000, buyRate: 6.7, sellRate: 6.64 });
  it('真实案例：本金 11 万，6.70 买进、6.64 卖出 → 亏损 985.07', () => {
    expect(realCase).toBe(985.07);
  });
});

describe('批次毛利润（实收 − 拿货成本 − 费用）', () => {
  const base = {
    salesAmount: 288000,
    receivedAmount: 280000,
    actualCost: 66600,
    expenses: 620.5,
  };

  it('应收口径：288000 − 66600 − 620.5 = 220779.5', () => {
    expect(batchProfit({ ...base, basis: 'receivable' })).toBe(220779.5);
  });

  it('实收口径：280000 − 66600 − 620.5 = 212779.5', () => {
    expect(batchProfit({ ...base, basis: 'cash' })).toBe(212779.5);
  });

  it('U 损耗已包含在拿货成本里，不再重复扣减', () => {
    expect(batchProfit({ ...base, basis: 'cash', exchangeLoss: 100 })).toBe(
      212779.5
    );
  });
});

describe('分红按出资比例分配', () => {
  it('PRD 用例：总额 6000，出资 30000/30000/60000 → 1500/1500/3000', () => {
    const shares = allocateShares(6000, [30000, 30000, 60000]);
    expect(shares).toEqual([1500, 1500, 3000]);
    expect(round2(shares.reduce((sum, value) => sum + value, 0))).toBe(6000);
  });

  it('除不尽时用最大余数法补齐，合计严格等于总额', () => {
    const shares = allocateShares(100, [1, 1, 1]);
    expect(shares).toEqual([33.34, 33.33, 33.33]);
    expect(round2(shares.reduce((sum, value) => sum + value, 0))).toBe(100);
  });

  it('出资总额为 0 时全部为 0', () => {
    expect(allocateShares(6000, [0, 0])).toEqual([0, 0]);
  });

  it('分红总额为 0 时全部为 0', () => {
    expect(allocateShares(0, [30000, 60000])).toEqual([0, 0]);
  });
});
