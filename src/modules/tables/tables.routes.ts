import { Hono } from "hono";
import { isBuilder } from "../permissions/personas";
import type { AuthVar } from "../../lib/middleware";
import { createEntitySchema, updateEntitySchema } from "../entities/entities.schema";
import * as service from "../entities/entities.service";

const app = new Hono<{ Variables: AuthVar }>();

app.use("*", async (c, next) => {
  if (c.req.method !== "GET" && !isBuilder(c.get("user")?.role)) {
    return c.json({ error: "Developer or admin access required" }, 403);
  }
  await next();
});

app.get("/", async (c) => {
  const orgSlug = c.req.param("orgSlug") as string;
  const { organizations, tables, columns } = await import("../../db/schema");
  const { eq, asc, inArray } = await import("drizzle-orm");
  const { db } = await import("../../db/connection");
  const [org] = await db.select().from(organizations).where(eq(organizations.slug, orgSlug));
  if (!org) return c.json({ error: "Organization not found" }, 404);
  const tableRows = await db.select().from(tables).where(eq(tables.orgId, org.id)).orderBy(tables.id);
  const colRows = await db.select().from(columns).orderBy(columns.sortOrder, columns.id);
  const { columnOptions } = await import("../../db/schema");
  const optRows = colRows.length
    ? await db.select().from(columnOptions).where(inArray(columnOptions.fieldId, colRows.map((f) => f.id))).orderBy(columnOptions.sortOrder)
    : [];
  const optMap = new Map<number, string[]>();
  for (const o of optRows) {
    const arr = optMap.get(o.fieldId) ?? [];
    arr.push(o.value);
    optMap.set(o.fieldId, arr);
  }
  return c.json(
    tableRows.map((t) => ({
      ...t,
      fields: colRows
        .filter((f) => f.entityId === t.id)
        .map((f) => ({ ...f, options: optMap.get(f.id) ?? [] })),
    })),
  );
});

app.post("/", async (c) => {
  const orgSlug = c.req.param("orgSlug") as string;
  const body = await c.req.json();
  // Hierarchical: org comes from URL — inject it so the shared schema validates
  const { organizations } = await import("../../db/schema");
  const { eq } = await import("drizzle-orm");
  const { db } = await import("../../db/connection");
  const [orgParam] = await db.select().from(organizations).where(eq(organizations.slug, orgSlug));
  if (!orgParam) return c.json({ error: "Organization not found" }, 404);
  const parsed = createEntitySchema.safeParse({ ...body, orgId: orgParam.id });
  if (!parsed.success) return c.json({ error: "Invalid body", details: parsed.error.flatten() }, 400);
  const scope = { orgId: orgParam.id, orgSlug: orgParam.slug, projectId: parsed.data.projectId ?? null };
  const entity = await service.createEntity({ slug: parsed.data.slug, label: parsed.data.label, scope, viewRole: parsed.data.viewRole, editRole: parsed.data.editRole });
  return c.json(entity, 201);
});

app.get("/:tableSlug", async (c) => {
  const { orgSlug, tableSlug } = c.req.param() as any;
  const { getTableBySlug } = await import("../../lib/registry");
  const { db } = await import("../../db/connection");
  const resolved = await getTableBySlug(db, orgSlug, tableSlug);
  if (!resolved) return c.json({ error: "Table not found" }, 404);
  return c.json({ ...resolved.entity, fields: resolved.columns });
});

// Fields (hierarchical)
app.post("/:tableSlug/fields", async (c) => {
  const { orgSlug, tableSlug } = c.req.param() as any;
  const { getTableBySlug } = await import("../../lib/registry");
  const { db } = await import("../../db/connection");
  const resolved = await getTableBySlug(db, orgSlug, tableSlug);
  if (!resolved) return c.json({ error: "Table not found" }, 404);
  // Reuse legacy dev field creation logic via service
  const body = await c.req.json();
  const { createField } = await import("../../modules/fields/fields.service");
  const field = await createField(resolved, body);
  return c.json(field, 201);
});

export default app;
