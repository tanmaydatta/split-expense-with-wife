import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './src/db/migrations',
  schema: './src/db/schema',
  dialect: 'sqlite',
  driver: 'd1-http',
  // Add comments to generated migrations for idempotency guidance
  verbose: true,
  strict: true,
  dbCredentials: {
    accountId: process.env.CLOUDFLARE_ACCOUNT_ID || '',
    databaseId: process.env.CLOUDFLARE_DATABASE_ID || '', 
    token: process.env.CLOUDFLARE_D1_TOKEN || '',
  },
}); 