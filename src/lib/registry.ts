// @ts-nocheck
import { eq, and, asc, inArray } from "drizzle-orm";
import type { Db } from "../db";
import { entities, fields, fieldOptions, orgs } from "../db/schema";
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
  relationEntityId: number | null;
  relationFieldName?: string | null;
  inDetail?: boolean;
}

export interface ResolvedEntity {
  entity: typeof entities.$inferSelect;
  /** Postgres schema owning this entity's physical table (= org slug). */
  orgSlug: string;
  fields: FieldWithOptions[];
}

/**
 * Resolves an (org, entity) pair against the registry. All /api/data handlers
 * MUST go through this — URL params are never interpolated into SQL without
 * this check. Slugs are unique per org, so both parts are required to resolve
 * the physical `<org_slug>.<entity_slug>` table unambiguously.
 */
export async function getEntityBySlug(db: Db, orgSlug: string, slug: string): Promise<ResolvedEntity | undefined> {
  const [row] = await db
    .select({ entity: entities, orgSlug: orgs.slug })
    .from(entities)
    .innerJoin(orgs, eq(orgs.id, entities.orgId))
    .where(and(eq(orgs.slug, orgSlug), eq(entities.slug, slug)));
  if (!row) return undefined;
  const fieldRows = await db
    .select()
    .from(fields)
    .where(eq(fields.entityId, row.entity.id))
    .orderBy(asc(fields.sortOrder), asc(fields.id));
  const optionRows =
    fieldRows.length > 0
      ? await db
          .select()
          .from(fieldOptions)
          .where(inArray(fieldOptions.fieldId, fieldRows.map((f) => f.id)))
          .orderBy(asc(fieldOptions.sortOrder), asc(fieldOptions.id))
      : [];
  return { // @ts-ignore
      
    entity: row.entity,
    orgSlug: row.orgSlug,
    fields: fieldRows.map((f) => ({
      ...f,
      options: optionRows.filter((o) => o.fieldId === f.id).map((o) => o.value),
    })),
  };
}
