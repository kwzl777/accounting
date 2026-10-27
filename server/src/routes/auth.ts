import { Router } from 'express';
import { findUserByUsername, requireAuth, signToken, verifyPassword } from '../auth.js';

const router = Router();

router.post('/login', async (req, res) => {
  const body = (req.body ?? {}) as { username?: string; password?: string };
  const username = typeof body.username === 'string' ? body.username.trim() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!username || !password) {
    res.status(400).json({ error: '用户名和密码不能为空' });
    return;
  }
  const user = await findUserByUsername(username);
  if (!user) {
    res.status(401).json({ error: '用户名或密码错误' });
    return;
  }
  const ok = await verifyPassword(password, user.password_hash);
  if (!ok) {
    res.status(401).json({ error: '用户名或密码错误' });
    return;
  }
  const token = signToken({ id: user.id, username: user.username });
  res.json({ token, user: { id: user.id, username: user.username } });
});

router.post('/logout', (_req, res) => {
  res.status(204).end();
});

router.get('/me', requireAuth, (req, res) => {
  const user = (req as unknown as { user: { id: number; username: string } }).user;
  res.json({ user });
});

export default router;
