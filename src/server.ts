/**
 * OpenNano-CRM — Server bootstrap
 *
 * Responsibilities:
 *  1. Run Drizzle migrations
 *  2. Reconcile org schemas (each org owns a Postgres schema)
 *  3. Start Hono via Bun.serve
 */

import { serve } from "bun";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { db } from "./db/connection";
import { createApp } from "./app";
import { ensureOrgSchema } from "./lib/dynamic-sql";
import { env } from "./config/env";

await migrate(db, { migrationsFolder: "./drizzle" });

{
  const { organizations } = await import("./db/schema");
  const rows = await db.select().from(organizations);
  for (const org of rows) {
    try {
      await ensureOrgSchema(db, org.slug);
    } catch (e) {
      console.error(`[bootstrap] could not ensure schema for org "${org.slug}"`, e);
    }
  }
}

const app = createApp();

serve({ fetch: app.fetch, port: env.port });
console.log(`OpenNano-CRM listening on http://localhost:${env.port}`);
console.log(`Hierarchy: Organization → Project → Entity (Table) → Record`);
