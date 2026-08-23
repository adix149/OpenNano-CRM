import { drizzle } from "drizzle-orm/bun-sql";
import * as schema from "./schema";
import { env } from "../config/env";

/**
 * Singleton Drizzle client backed by Bun's native `bun:sql` driver.
 * Import `db` everywhere — never create a second instance.
 */
export const db = drizzle({
  connection: env.databaseUrl,
  schema,
});

export type Db = typeof db;
