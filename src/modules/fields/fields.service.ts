import { eq } from "drizzle-orm";
import { db } from "../../db/connection";
import { tables, columns } from "../../db/schema";
import { ensureOrgSchema, addFieldColumn } from "../../lib/dynamic-sql";

export async function createField(resolved: any, body: any) {
  const { name, label, type, is_required, options, relationEntityId, relationEntitySlug, relationFieldName, in_detail } = body;
  // Simplified validation - reuse existing logic from dev.ts
  const { z } = await import("zod");
  const schema = z.object({
    name: z.string().regex(/^[a-z][a-z0-9_]*$/),
    label: z.string().min(1),
    type: z.enum(["text","number","decimal","boolean","date","datetime","email","phone","url","location","select","relation"]),
    is_required: z.boolean().optional(),
    in_detail: z.boolean().optional(),
    options: z.array(z.string()).optional(),
    relationEntityId: z.number().optional(),
    relationEntitySlug: z.string().optional(),
    relationFieldName: z.string().optional(),
  });
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("Invalid body");
  
  let relId = null;
  if (type === "relation") {
    if (relationEntitySlug) {
      const [t] = await db.select().from(tables).where(eq(tables.slug, relationEntitySlug));
      if (t) relId = t.id;
    } else if (relationEntityId) relId = relationEntityId;
  }
  
  await addFieldColumn(db, resolved.orgSlug, resolved.entity.slug, name, type);
  const [field] = await db.insert(columns).values({
    entityId: resolved.entity.id,
    name, label, type, isRequired: !!is_required, relationEntityId: relId, relationFieldName: relationFieldName ?? null, inDetail: in_detail ?? true
  }).returning();
  return field;
}
