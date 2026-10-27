import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';

const router = Router();

router.use(requireAuth);

router.get('/', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit ?? 100) || 100, 1), 500);
  const entity =
    typeof req.query.entity === 'string' && req.query.entity ? req.query.entity : '';

  const logs = entity
    ? db.prepare('SELECT * FROM audit_logs WHERE entity = ? ORDER BY id DESC LIMIT ?').all(entity, limit)
    : db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT ?').all(limit);

  res.json({ logs });
});

export default router;
