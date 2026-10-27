import { Router } from 'express';
import { requireAuth } from '../auth.js';
import { db } from '../db.js';

const router = Router();

router.use(requireAuth);

router.get('/', (_req, res) => {
  const categories = db
    .prepare('SELECT * FROM expense_categories ORDER BY is_default DESC, id ASC')
    .all();
  res.json(categories);
});

router.post('/', (req, res) => {
  const body = (req.body ?? {}) as { name?: string };
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) {
    res.status(400).json({ error: '类别名称不能为空' });
    return;
  }
  const exists = db.prepare('SELECT id FROM expense_categories WHERE name = ?').get(name);
  if (exists) {
    res.status(400).json({ error: '该类别已存在' });
    return;
  }
  const now = new Date().toISOString();
  const info = db
    .prepare('INSERT INTO expense_categories (name, is_default, created_at) VALUES (?, 0, ?)')
    .run(name, now);
  const category = db
    .prepare('SELECT * FROM expense_categories WHERE id = ?')
    .get(Number(info.lastInsertRowid));
  res.status(201).json(category);
});

export default router;
