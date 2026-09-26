import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/prisma/client.ts';
import { DATABASE_URL } from './config.ts';

export const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
export type { User } from './generated/prisma/client.ts';
