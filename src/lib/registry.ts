// @ts-nocheck
import { eq, and, asc, inArray } from "drizzle-orm";
import type { Db } from "../db/connection";
import { tables, columns, columnOptions, organizations } from "../db/schema";
import type { FieldType } from "./dynamic-sql";

export interface FieldWithOptions {
  id: number;
  entityId: number;
  name: string;
  label: string;
  type: FieldType;
  isRequired: boolean;
  sortOrder: number;
  createdAt: Date;
  options: string[];
  relationTableId: number | null;
  relationFieldName?: string | null;
  inDetail?: boolean;
}

export interface ResolvedEntity {
  entity: typeof tables.$inferSelect;
  /** Postgres schema owning this entity's physical table (= org slug). */
  orgSlug: string;
  columns: FieldWithOptions[];
}

/**
 * Resolves an (org, entity) pair against the registry. All /api/data handlers
 * MUST go through this — URL params are never interpolated into SQL without
 * this check. Slugs are unique per org, so both parts are required to resolve
 * the physical `<org_slug>.<entity_slug>` table unambiguously.
 */
export async function getEntityBySlug(db: Db, orgSlug: string, slug: string): Promise<ResolvedEntity | undefined> {
  const [row] = await db
    .select({ entity: tables, orgSlug: organizations.slug })
    .from(tables)
    .innerJoin(organizations, eq(organizations.id, tables.orgId))
    .where(and(eq(organizations.slug, orgSlug), eq(tables.slug, slug)));
  if (!row) return undefined;
  const fieldRows = await db
    .select()
    .from(columns)
    .where(eq(columns.entityId, row.entity.id))
    .orderBy(asc(columns.sortOrder), asc(columns.id));
  const optionRows =
    fieldRows.length > 0
      ? await db
          .select()
          .from(columnOptions)
          .where(inArray(columnOptions.fieldId, fieldRows.map((f) => f.id)))
          .orderBy(asc(columnOptions.sortOrder), asc(columnOptions.id))
      : [];
  return { // @ts-ignore
      
    entity: row.entity,
    orgSlug: row.orgSlug,
    columns: fieldRows.map((f) => ({
      ...f,
      options: optionRows.filter((o) => o.fieldId === f.id).map((o) => o.value),
    })),
  };
}
export const getTableBySlug = getEntityBySlug;
