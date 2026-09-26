import { hash, verify } from '@node-rs/argon2';
import fastifyCookie from '@fastify/cookie';
import type { FastifyReply, FastifyRequest } from 'fastify';
import jwt from 'jsonwebtoken';
import { type Me, DAILY_TOP_UP } from '@goc/shared';
import { COOKIE, JWT_SECRET, SESSION_DAYS } from './config.ts';
import { type User, db } from './db.ts';

export const hashPassword = (pw: string) => hash(pw);
export const checkPassword = (hashed: string, pw: string) => verify(hashed, pw).catch(() => false);

export function setSession(reply: FastifyReply, userId: string) {
  const token = jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: `${SESSION_DAYS}d` });
  reply.setCookie(COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_DAYS * 86400,
  });
}

export const clearSession = (reply: FastifyReply) => reply.clearCookie(COOKIE, { path: '/' });

function userIdFromToken(token: string | undefined): string | null {
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return typeof payload === 'object' && typeof payload.sub === 'string' ? payload.sub : null;
  } catch {
    return null;
  }
}

/** Resolve the logged-in user id from a raw Cookie header (used by the socket handshake). */
export const userIdFromCookieHeader = (header: string | undefined) =>
  userIdFromToken(header ? fastifyCookie.parse(header)[COOKIE] : undefined);

declare module 'fastify' {
  interface FastifyRequest {
    user: User;
  }
}

/** preHandler: 401 unless the request carries a valid session for an existing user. */
export async function requireUser(req: FastifyRequest, reply: FastifyReply) {
  const id = userIdFromToken(req.cookies[COOKIE]);
  const user = id ? await db.user.findUnique({ where: { id } }) : null;
  if (!user) return reply.code(401).send({ error: 'Not logged in' });
  req.user = user;
}

const DAY_MS = 86_400_000;

export function nextTopUp(user: User): string | null {
  if (!user.lastTopUp) return null;
  const next = user.lastTopUp.getTime() + DAY_MS;
  return next <= Date.now() ? null : new Date(next).toISOString();
}

export const toMe = (u: User): Me => ({
  id: u.id,
  username: u.username,
  displayName: u.displayName,
  avatar: u.avatar,
  cardBack: u.cardBack,
  email: u.email,
  chips: u.chips,
  nextTopUp: nextTopUp(u),
});

export { DAILY_TOP_UP };
