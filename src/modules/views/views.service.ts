import { and, eq } from "drizzle-orm";
import { db } from "../../db/connection";
import { views, tables } from "../../db/schema";
import { notFound, conflict } from "../../lib/errors";
import type { CreateViewInput, UpdateViewInput } from "./views.schema";

export async function listViews(organizationId: number, tableId: number) {
  return db
    .select()
    .from(views)
    .where(and(eq(views.organizationId, organizationId), eq(views.tableId, tableId)))
    .orderBy(views.slug);
}

export async function getView(organizationId: number, tableId: number, slug: string) {
  const [view] = await db
    .select()
    .from(views)
    .where(and(eq(views.organizationId, organizationId), eq(views.tableId, tableId), eq(views.slug, slug)));
  if (!view) throw notFound(`View "${slug}" not found`);
  return view;
}

export async function createView(organizationId: number, tableId: number, input: CreateViewInput) {
  const [exists] = await db
    .select({ id: views.id })
    .from(views)
    .where(and(eq(views.tableId, tableId), eq(views.slug, input.slug)));
  if (exists) throw conflict(`View "${input.slug}" already exists`);

  const [view] = await db
    .insert(views)
    .values({
      organizationId,
      tableId,
      slug: input.slug,
      label: input.label,
      kind: input.kind ?? "form",
      layout: input.layout as any,
      config: input.config as any,
      isDefault: input.isDefault ?? false,
    })
    .returning();
  return view;
}

export async function updateView(organizationId: number, tableId: number, slug: string, patch: UpdateViewInput) {
  const view = await getView(organizationId, tableId, slug);
  const [updated] = await db
    .update(views)
    .set({
      ...(patch.label !== undefined ? { label: patch.label } : {}),
      ...(patch.kind !== undefined ? { kind: patch.kind } : {}),
      ...(patch.layout !== undefined ? { layout: patch.layout as any } : {}),
      ...(patch.config !== undefined ? { config: patch.config as any } : {}),
      ...(patch.isDefault !== undefined ? { isDefault: patch.isDefault } : {}),
    })
    .where(eq(views.id, view.id))
    .returning();
  return updated;
}

export async function deleteView(organizationId: number, tableId: number, slug: string) {
  const view = await getView(organizationId, tableId, slug);
  await db.delete(views).where(eq(views.id, view.id));
}

export async function resolveTable(organizationSlug: string, tableSlug: string) {
  const { organizations } = await import("../../db/schema");
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, organizationSlug));
  if (!org) throw notFound(`Organization "${organizationSlug}" not found`);
  const [table] = await db.select().from(tables).where(and(eq(tables.orgId, org.id), eq(tables.slug, tableSlug)));
  if (!table) throw notFound(`Table "${tableSlug}" not found in "${organizationSlug}"`);
  return { org, table };
}
