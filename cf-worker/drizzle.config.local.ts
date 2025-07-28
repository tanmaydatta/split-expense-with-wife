import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  out: './migrations',
  schema: './src/db/schema',
  dialect: 'sqlite',
  dbCredentials: {
    url: './.wrangler/state/v3/d1/miniflare-D1DatabaseObject/9c76df032f07de22bbd7bb00bd80658befcac2d65df57447c2f04a1f19dc3dbf.sqlite',
  },
}); 