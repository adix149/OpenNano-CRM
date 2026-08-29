import { and, eq } from "drizzle-orm";
import { db } from "../../db/connection";
import { tables, columns, columnOptions } from "../../db/schema";
import { addFieldColumn, dropColumnIfExists } from "../../lib/dynamic-sql";

export async function createField(resolved: any, body: any) {
  // Keep the canonical table route subject to the same field rules as Dev Studio.
  const { z } = await import("zod");
  const schema = z.object({
    name: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().min(1),
    type: z.enum(["text","number","decimal","boolean","date","datetime","email","phone","url","location","select","relation"]),
    is_required: z.boolean().optional(),
    in_detail: z.boolean().optional(),
    options: z.array(z.string().min(1)).min(1).optional(),
    relationEntityId: z.number().int().positive().optional(),
    relationEntitySlug: z.string().optional(),
    relationFieldName: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("Invalid field definition");
  const { name, label, type, is_required, options, relationEntityId, relationEntitySlug, relationFieldName, in_detail } = parsed.data;
  if (name === "id" || name === "created_at") throw new Error(`Field name "${name}" is reserved`);
  if (resolved.columns.some((field: any) => field.name === name)) throw new Error(`Field "${name}" already exists`);
  if (type === "select" && !options?.length) throw new Error("Select columns require at least one option");
  
  let relId = null;
  if (type === "relation") {
    if (relationEntitySlug) {
      const [t] = await db.select().from(tables).where(and(eq(tables.slug, relationEntitySlug), eq(tables.orgId, resolved.entity.orgId)));
      if (t) relId = t.id;
    } else if (relationEntityId) {
      const [t] = await db.select().from(tables).where(and(eq(tables.id, relationEntityId), eq(tables.orgId, resolved.entity.orgId)));
      if (t) relId = t.id;
    }
    if (!relId) throw new Error("Relation target entity not found");
    if (!relationFieldName) throw new Error("Relation columns require relationFieldName");
    const targetFields = await db.select({ name: columns.name }).from(columns).where(eq(columns.entityId, relId));
    if (!targetFields.some((field) => field.name === relationFieldName)) throw new Error("Relation key column not found");
  }

  await addFieldColumn(db, resolved.orgSlug, resolved.entity.slug, name, type);
  try {
    const [field] = await db.insert(columns).values({
      entityId: resolved.entity.id,
      name, label, type, isRequired: !!is_required, relationEntityId: relId, relationFieldName: relationFieldName ?? null, inDetail: in_detail ?? true,
    }).returning();
    if (type === "select") {
      await db.insert(columnOptions).values(options!.map((value, sortOrder) => ({ fieldId: field.id, value, sortOrder })));
    }
    return { ...field, options: options ?? [] };
  } catch (error) {
    await dropColumnIfExists(db, resolved.orgSlug, resolved.entity.slug, name).catch(() => {});
    throw error;
  }
}
