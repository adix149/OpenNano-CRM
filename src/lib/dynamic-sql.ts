/**
 * Central module for ALL dynamically-built SQL.
 *
 * Every route that touches a runtime-declared table/column must go through the
 * helpers here. Identifiers (`slug`, field `name`, org `schema`) are
 * user-supplied strings that end up interpolated into DDL/DML, so they are
 * strictly allowlisted before ever touching a query string — never trust them
 * as safe by default.
 *
 * Storage model: each org owns one Postgres SCHEMA named after its slug, and
 * all of its dynamic tables live inside it (`<org_slug>.<entity_slug>`). That
 * makes org-level backup/restore a single schema dump and org deletion a
 * single DROP SCHEMA.
 */
import { sql } from "drizzle-orm";
import type { Db } from "../db/connection";

/** Strict identifier allowlist: lowercase start, then lowercase/digits/underscore. */
const IDENTIFIER_RE = /^[a-z][a-z0-9_]*$/;

export class IdentifierError extends Error {
  constructor(public readonly value: string) {
    super(`Invalid identifier: "${value}"`);
  }
}

/**
 * Validates an identifier against the allowlist and returns it unchanged.
 * The regex also guarantees no quoting characters can sneak into DDL.
 */
export function assertIdentifier(value: string): string {
  if (!IDENTIFIER_RE.test(value)) throw new IdentifierError(value);
  return value;
}

/** Qualified `<schema>.<table>` fragment (both parts validated + quoted). */
function q(schema: string, table: string) {
  return sql`${sql.identifier(assertIdentifier(schema))}.${sql.identifier(assertIdentifier(table))}`;
}

/**
 * Field types mapped to Postgres column types.
 * - select/email/phone/url/location store TEXT (select stores the chosen
 *   option value; location stores "lat,lng").
 * - decimal is a fixed-scale NUMERIC; number stays arbitrary-precision NUMERIC.
 * - relation stores INTEGER FK to another entity's record (connection key).
 */
export const FIELD_TYPE_TO_PG = {
  text: "TEXT",
  number: "NUMERIC",
  decimal: "NUMERIC(12,2)",
  boolean: "BOOLEAN",
  date: "DATE",
  datetime: "TIMESTAMPTZ",
  email: "TEXT",
  phone: "TEXT",
  url: "TEXT",
  location: "TEXT",
  select: "TEXT",
  relation: "INTEGER",
} as const;

export type FieldType = keyof typeof FIELD_TYPE_TO_PG;

// ---------------------------------------------------------------------------
// Dev API DDL helpers (identifiers must be pre-validated with assertIdentifier)
// ---------------------------------------------------------------------------

export async function ensureOrgSchema(db: Db, schema: string): Promise<void> {
  await db.execute(sql`CREATE SCHEMA IF NOT EXISTS ${sql.identifier(assertIdentifier(schema))}`);
}

export async function createEntityTable(db: Db, schema: string, slug: string): Promise<void> {
  await db.execute(
    sql`CREATE TABLE ${q(schema, slug)} (id SERIAL PRIMARY KEY, created_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );
}

export async function dropEntityTable(db: Db, schema: string, slug: string): Promise<void> {
  await db.execute(sql`DROP TABLE IF EXISTS ${q(schema, slug)} CASCADE`);
}

export async function renameOrgSchema(db: Db, oldSchema: string, newSchema: string): Promise<void> {
  await db.execute(
    sql`ALTER SCHEMA ${sql.identifier(assertIdentifier(oldSchema))} RENAME TO ${sql.identifier(assertIdentifier(newSchema))}`,
  );
}

export async function dropOrgSchema(db: Db, schema: string): Promise<void> {
  await db.execute(sql`DROP SCHEMA IF EXISTS ${sql.identifier(assertIdentifier(schema))} CASCADE`);
}

export async function addFieldColumn(db: Db, schema: string, slug: string, name: string, type: FieldType): Promise<void> {
  const pgType = FIELD_TYPE_TO_PG[type];
  await db.execute(sql`ALTER TABLE ${q(schema, slug)} ADD COLUMN ${sql.identifier(assertIdentifier(name))} ${sql.raw(pgType)}`);
}

export async function dropColumnIfExists(db: Db, schema: string, slug: string, name: string): Promise<void> {
  await db.execute(sql`ALTER TABLE ${q(schema, slug)} DROP COLUMN IF EXISTS ${sql.identifier(assertIdentifier(name))}`);
}

/**
 * Changes a column's type. Builds a USING cast that tolerates empty strings
 * when converting FROM text; Postgres itself rejects impossible casts with a
 * clear error, which routes surface as 4xx without touching the registry.
 */
export async function changeColumnType(
  db: Db,
  schema: string,
  slug: string,
  name: string,
  currentType: FieldType,
  newType: FieldType,
): Promise<void> {
  const col = sql.identifier(assertIdentifier(name));
  const pgType = FIELD_TYPE_TO_PG[newType];
  const using =
    currentType === "text" && newType !== "text"
      ? sql`NULLIF(${col}, '')::${sql.raw(pgType)}`
      : sql`${col}::${sql.raw(pgType)}`;
  await db.execute(sql`ALTER TABLE ${q(schema, slug)} ALTER COLUMN ${col} TYPE ${sql.raw(pgType)} USING ${using}`);
}

export async function renameColumn(
  db: Db,
  schema: string,
  slug: string,
  oldName: string,
  newName: string,
): Promise<void> {
  await db.execute(
    sql`ALTER TABLE ${q(schema, slug)} RENAME COLUMN ${sql.identifier(assertIdentifier(oldName))} TO ${sql.identifier(assertIdentifier(newName))}`,
  );
}

export async function renameEntityTable(db: Db, schema: string, oldSlug: string, newSlug: string): Promise<void> {
  await db.execute(
    sql`ALTER TABLE ${q(schema, oldSlug)} RENAME TO ${sql.identifier(assertIdentifier(newSlug))}`,
  );
}

export async function countRows(db: Db, schema: string, slug: string): Promise<number> {
  const result = await db.execute<{ count: number }>(sql`SELECT COUNT(*)::int AS count FROM ${q(schema, slug)}`);
  return Number(result[0]?.count ?? 0);
}

// ---------------------------------------------------------------------------
// Data API DML helpers (identifiers pre-validated; values always parameterized)
// ---------------------------------------------------------------------------

export interface RowFilter {
  eq?: Record<string, unknown>;
}

export async function listRows(db: Db, schema: string, slug: string, fieldNames: string[]): Promise<Record<string, unknown>[]> {
  // v0 limitation: no pagination/search/filter/sort — flat list capped at 200.
  const cols = fieldNames.length > 0 ? sql`, ${sql.join(fieldNames.map((n) => sql.identifier(n)), sql`, `)}` : sql``;
  const result = await db.execute(sql`SELECT id, created_at${cols} FROM ${q(schema, slug)} ORDER BY id LIMIT 200`);
  return result as Record<string, unknown>[];
}

export async function getRowById(
  db: Db,
  schema: string,
  slug: string,
  fieldNames: string[],
  id: number,
): Promise<Record<string, unknown> | undefined> {
  const cols = fieldNames.length > 0 ? sql`, ${sql.join(fieldNames.map((n) => sql.identifier(n)), sql`, `)}` : sql``;
  const result = await db.execute(
    sql`SELECT id, created_at${cols} FROM ${q(schema, slug)} WHERE id = ${id}`,
  );
  return result[0] as Record<string, unknown> | undefined;
}

export async function insertRow(
  db: Db,
  schema: string,
  slug: string,
  values: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const names = Object.keys(values);
  if (names.length === 0) {
    const result = await db.execute(sql`INSERT INTO ${q(schema, slug)} DEFAULT VALUES RETURNING *`);
    return result[0] as Record<string, unknown>;
  }
  const cols = sql.join(names.map((n) => sql.identifier(assertIdentifier(n))), sql`, `);
  const params = sql.join(names.map((n) => sql`${values[n]}`), sql`, `);
  const result = await db.execute(sql`INSERT INTO ${q(schema, slug)} (${cols}) VALUES (${params}) RETURNING *`);
  return result[0] as Record<string, unknown>;
}

export async function updateRowById(
  db: Db,
  schema: string,
  slug: string,
  values: Record<string, unknown>,
  id: number,
): Promise<Record<string, unknown> | undefined> {
  const assignments = sql.join(
    Object.keys(values).map((n) => sql`${sql.identifier(assertIdentifier(n))} = ${values[n]}`),
    sql`, `,
  );
  const result = await db.execute(
    sql`UPDATE ${q(schema, slug)} SET ${assignments} WHERE id = ${id} RETURNING *`,
  );
  return result[0] as Record<string, unknown> | undefined;
}

export async function deleteRowById(db: Db, schema: string, slug: string, id: number): Promise<boolean> {
  const result = await db.execute(sql`DELETE FROM ${q(schema, slug)} WHERE id = ${id} RETURNING id`);
  return result.length > 0;
}
