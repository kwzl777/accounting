import { describe, it, expect } from 'vitest';
import bcrypt from 'bcryptjs';
import { signToken, verifyToken, verifyPassword } from './auth.js';

describe('auth: token', () => {
  it('signs and verifies a token roundtrip', () => {
    const token = signToken({ id: 1, username: 'admin' });
    expect(verifyToken(token)).toEqual({ id: 1, username: 'admin' });
  });

  it('rejects an invalid token', () => {
    expect(verifyToken('invalid.token.value')).toBeNull();
  });
});

describe('auth: password', () => {
  it('verifies the correct password', async () => {
    const hash = bcrypt.hashSync('admin123', 10);
    expect(await verifyPassword('admin123', hash)).toBe(true);
  });

  it('rejects a wrong password', async () => {
    const hash = bcrypt.hashSync('admin123', 10);
    expect(await verifyPassword('wrong-password', hash)).toBe(false);
  });
});
