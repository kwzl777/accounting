import { pinyin } from 'pinyin-pro';

function quantityText(value: number): string {
  const rounded = Math.round((Number(value) || 0) * 100) / 100;
  return String(rounded);
}

/** 批次编号：产品名拼音首字母 + 出货日期 + 出货数量 */
export function buildBatchCode(productName: string, date: string, quantity: number): string {
  const initials =
    pinyin(productName, {
      pattern: 'first',
      toneType: 'none',
      type: 'array',
    })
      .join('')
      .replace(/[^a-zA-Z0-9]/g, '')
      .toUpperCase() || 'CP';
  const dateCode = String(date || '').replace(/\D/g, '');
  return `${initials}-${dateCode}-${quantityText(quantity)}`;
}
