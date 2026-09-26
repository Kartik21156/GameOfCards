import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { requireDatabaseUrl } from './env.ts';

export const SERVER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CLIENT_DIST = join(SERVER_DIR, '..', 'client', 'dist');

export const PORT = Number(process.env.PORT ?? 3001);
export const HOST = process.env.HOST ?? '0.0.0.0';
export const DATABASE_URL = requireDatabaseUrl();
export const COOKIE = 'goc_session';
export const SESSION_DAYS = 30;

/** Use JWT_SECRET if set, otherwise a random secret persisted next to the db so sessions survive restarts. */
function loadSecret(): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const file = join(SERVER_DIR, '.jwt-secret');
  if (!existsSync(file)) writeFileSync(file, randomBytes(32).toString('hex'));
  return readFileSync(file, 'utf8').trim();
}
export const JWT_SECRET = loadSecret();
