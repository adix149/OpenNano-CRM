// @ts-nocheck
/**
 * OpenNano-CRM — Entity (Table) service
 *
 * Pure business logic for dynamic tables.
 * Route handlers validate input and delegate here.
 */

import { and, eq } from "drizzle-orm";
import { db } from "../../db/connection";
import { entities, orgs, projects } from "../../db/schema";
import {
  ensureOrgSchema,
  createEntityTable,
  dropEntityTable,
  renameEntityTable,
  countRows,
} from "../../lib/dynamic-sql";
import { conflict, notFound } from "../../lib/errors";

export interface EntityScope {
  orgId: number;
  orgSlug: string;
  projectId: number | null;
}

function pgErrorMessage(e: unknown): string {
  const err = e as any;
  return String(err?.cause?.message ?? err?.message ?? "");
}

export async function resolveScope(input: {
  projectId?: number;
  projectSlug?: string;
  organizationId?: number;
  orgId?: number;
}): Promise<EntityScope> {
  const orgId = (input as any).orgId ?? (input as any).orgId;
  if (input.projectId !== undefined || input.projectSlug !== undefined) {
    const [proj] = input.projectId
      ? await db.select().from(projects).where(eq(projects.id, input.projectId))
      : await db.select().from(projects).where(eq(projects.slug, input.projectSlug!));
    if (!proj) throw notFound("Project not found");
    const [org] = await db.select().from(orgs).where(eq(orgs.id, proj.orgId));
    if (!org) throw notFound("Project has no organization");
    return { orgId: org.id, orgSlug: org.slug, projectId: proj.id };
  }
  const [org] = await db.select().from(orgs).where(eq(orgs.id, orgId!));
  if (!org) throw notFound("Organization not found");
  return { orgId: org.id, orgSlug: org.slug, projectId: null };
}

export async function createEntity(input: {
  slug: string;
  label: string;
  scope: EntityScope;
  viewRole?: string;
  editRole?: string;
}) {
  const [existing] = await db
    .select({ id: entities.id })
    .from(entities)
    .where(and(eq(entities.orgId, input.scope.orgId), eq(entities.slug, input.slug)));
  if (existing) throw conflict(`Entity "${input.slug}" already exists in organization "${input.scope.orgSlug}"`);

  await ensureOrgSchema(db, input.scope.orgSlug);

  try {
    await createEntityTable(db, input.scope.orgSlug, input.slug);
  } catch (e) {
    if (pgErrorMessage(e).includes("already exists")) {
      await dropEntityTable(db, input.scope.orgSlug, input.slug);
      await createEntityTable(db, input.scope.orgSlug, input.slug);
    } else throw e;
  }

  const [orgRow] = await db.select().from(orgs).where(eq(orgs.id, input.scope.orgId));

  try {
    const [entity] = await db
      .insert(entities)
      .values({
        slug: input.slug,
        label: input.label,
        orgId: input.scope.orgId,
        projectId: input.scope.projectId,
        viewRole: input.viewRole ?? orgRow.defaultViewRole,
        editRole: input.editRole ?? orgRow.defaultEditRole,
      })
      .returning();
    return entity;
  } catch (err) {
    await dropEntityTable(db, input.scope.orgSlug, input.slug).catch(() => {});
    throw err;
  }
}

export async function renameEntity(entityId: number, orgSlug: string, oldSlug: string, newSlug: string) {
  await renameEntityTable(db, orgSlug, oldSlug, newSlug);
}

export async function deleteEntity(entityId: number, orgSlug: string, slug: string) {
  const rowCount = await countRows(db, orgSlug, slug);
  if (rowCount > 0) throw conflict(`Entity "${slug}" still has ${rowCount} row(s); delete them first`);
  await dropEntityTable(db, orgSlug, slug);
}
