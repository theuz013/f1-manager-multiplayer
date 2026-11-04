import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';
import { prisma } from './db.js';

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password: string, stored: string) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 64));
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString('hex');
  await prisma.session.create({ data: { token, userId } });
  return token;
}

export async function userFromToken(header?: string) {
  const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const session = await prisma.session.findUnique({ where: { token }, include: { user: true } });
  return session?.user ?? null;
}
