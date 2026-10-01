import { defineConfig } from 'drizzle-kit';

/** Migrations are generated from src/server/db/schema.ts into ./drizzle and applied at startup by
 *  src/server/db/migrate.ts (and `pnpm db:migrate`). */
export default defineConfig({
  dialect: 'postgresql',
  schema: './src/server/db/schema.ts',
  out: './drizzle',
  dbCredentials: { url: process.env.DATABASE_URL ?? 'postgres://vewbox:vewbox@localhost:5432/vewbox' },
  strict: true,
  verbose: true,
});
