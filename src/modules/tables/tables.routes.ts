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
  // The URL supplies the organization; the request must supply a project
  // belonging to that organization.
  const { organizations } = await import("../../db/schema");
  const { eq } = await import("drizzle-orm");
  const { db } = await import("../../db/connection");
  const [orgParam] = await db.select().from(organizations).where(eq(organizations.slug, orgSlug));
  if (!orgParam) return c.json({ error: "Organization not found" }, 404);
  const parsed = createEntitySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid body", details: parsed.error.flatten() }, 400);
  const { projects } = await import("../../db/schema");
  const { and } = await import("drizzle-orm");
  const [project] = parsed.data.projectId
    ? await db.select().from(projects).where(and(eq(projects.id, parsed.data.projectId), eq(projects.orgId, orgParam.id)))
    : await db.select().from(projects).where(and(eq(projects.slug, parsed.data.projectSlug!), eq(projects.orgId, orgParam.id)));
  if (!project) return c.json({ error: "Project not found in this organization" }, 404);
  const scope = { orgId: orgParam.id, orgSlug: orgParam.slug, projectId: project.id };
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

app.patch("/:tableSlug", async (c) => {
  const { orgSlug, tableSlug } = c.req.param() as any;
  const { getTableBySlug } = await import("../../lib/registry");
  const { db } = await import("../../db/connection");
  const resolved = await getTableBySlug(db, orgSlug, tableSlug);
  if (!resolved) return c.json({ error: "Table not found" }, 404);
  const body = await c.req.json();
  const { updateEntitySchema } = await import("../entities/entities.schema");
  const parsed = updateEntitySchema.safeParse(body);
  if (!parsed.success) return c.json({ error: "Invalid body", details: parsed.error.flatten() }, 400);
  const { eq } = await import("drizzle-orm");
  const { tables } = await import("../../db/schema");
  const [updated] = await db.update(tables).set(parsed.data as any).where(eq(tables.id, resolved.entity.id)).returning();
  return c.json(updated);
});

app.delete("/:tableSlug", async (c) => {
  const { orgSlug, tableSlug } = c.req.param() as any;
  const { getTableBySlug } = await import("../../lib/registry");
  const { db } = await import("../../db/connection");
  const resolved = await getTableBySlug(db, orgSlug, tableSlug);
  if (!resolved) return c.json({ error: "Table not found" }, 404);
  const { countRows, dropEntityTable } = await import("../../lib/dynamic-sql");
  const cnt = await countRows(db, resolved.orgSlug, resolved.entity.slug);
  if (cnt > 0) return c.json({ error: `Table still has ${cnt} rows` }, 409);
  await dropEntityTable(db, resolved.orgSlug, resolved.entity.slug);
  const { tables, columns } = await import("../../db/schema");
  const { eq } = await import("drizzle-orm");
  await db.delete(columns).where(eq(columns.entityId, resolved.entity.id));
  await db.delete(tables).where(eq(tables.id, resolved.entity.id));
  return c.body(null, 204);
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
