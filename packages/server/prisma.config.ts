import { defineConfig } from 'prisma/config';
import { requireDatabaseUrl } from './src/env.ts';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: requireDatabaseUrl() },
});
