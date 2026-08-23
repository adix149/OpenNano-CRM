import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";

// Driver choice: drizzle-orm/bun-sql (Bun's native SQL client) — best-supported
// Bun driver in current Drizzle docs. Fallback documented in README: node-postgres.
export const db = drizzle({
  connection: process.env.DATABASE_URL ?? "postgres://nanobliss:nanobliss@localhost:5432/nanobliss",
  schema,
});

export type Db = typeof db;
