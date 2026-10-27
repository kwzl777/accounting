import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';

const router = Router();

router.use(requireAuth);

const DEFAULT_SETTINGS: Record<string, string> = {
  profit_basis: 'cash',
};

function readSettings(): Record<string, string> {
  const rows = db.prepare('SELECT key, value FROM app_settings').all() as Array<{
    key: string;
    value: string;
  }>;
  const settings: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) {
    settings[row.key] = row.value;
  }
  return settings;
}

router.get('/', (_req, res) => {
  res.json({ settings: readSettings() });
});

router.put('/', (req, res) => {
  const body = (req.body ?? {}) as { profit_basis?: string };
  if (body.profit_basis !== undefined) {
    if (body.profit_basis !== 'cash' && body.profit_basis !== 'receivable') {
      res.status(400).json({ error: '利润口径只能为 cash（实收）或 receivable（应收）' });
      return;
    }
    db.prepare(
      'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run('profit_basis', body.profit_basis);
  }
  res.json({ settings: readSettings() });
});

export default router;
