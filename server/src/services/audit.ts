import { db } from '../db.js';

/** 记录重要修改：实体、记录 ID、动作、修改前/后值、时间 */
export function logAudit(
  entity: string,
  recordId: number | null,
  action: string,
  before: unknown,
  after: unknown
): void {
  try {
    db.prepare(
      'INSERT INTO audit_logs (entity, record_id, action, before_json, after_json, created_at) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(
      entity,
      recordId,
      action,
      before === undefined || before === null ? null : JSON.stringify(before),
      after === undefined || after === null ? null : JSON.stringify(after),
      new Date().toISOString()
    );
  } catch (error) {
    console.error('[audit] 写入失败', error);
  }
}
