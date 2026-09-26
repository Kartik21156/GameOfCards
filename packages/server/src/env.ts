import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Load the repo-root .env (if present) into process.env without overriding real env vars. */
const envFile = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

export function requireDatabaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env in the repo root and fill in your Postgres connection string.',
    );
  }
  return url;
}
