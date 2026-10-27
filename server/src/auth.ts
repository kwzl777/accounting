import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { db, type UserRow } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-jwt-secret-change-me';
const JWT_EXPIRES_IN_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface AuthUser {
  id: number;
  username: string;
}

export function signToken(user: AuthUser): string {
  return jwt.sign(
    { sub: user.id, username: user.username },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN_SECONDS }
  );
}

export function verifyToken(token: string): AuthUser | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const payload = decoded as unknown as { sub: number; username: string };
    return { id: payload.sub, username: payload.username };
  } catch {
    return null;
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const user = token ? verifyToken(token) : null;
  if (!user) {
    res.status(401).json({ error: '未登录或登录已过期' });
    return;
  }
  (req as unknown as { user: AuthUser }).user = user;
  next();
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function findUserByUsername(username: string): Promise<UserRow | undefined> {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}
