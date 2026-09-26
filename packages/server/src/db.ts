import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
import { PrismaClient } from './generated/prisma/client.ts';
import { DATABASE_URL } from './config.ts';

export const db = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: DATABASE_URL }) });
export type { User } from './generated/prisma/client.ts';
