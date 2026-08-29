import { Hono } from "hono";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { db } from "../db";
import { entities, orgs } from "../db/schema";
import { buildCreateSchema, buildUpdateSchema } from "../lib/meta-schema";
import {
  listRows,
  getRowById,
  insertRow,
  updateRowById,
  deleteRowById,
} from "../lib/dynamic-sql";
import { getEntityBySlug } from "../lib/registry";
import { hasPersona, isBuilder } from "../lib/personas";
import type { AuthVar } from "../lib/middleware";

/**
 * Fully generic CRUD driven by the registry. There are no per-entity handlers:
 * every request resolves :slug via the entities table (404 if unknown), then
 * validates payloads against a zod schema built from the entity's field
 * metadata. All physical access is namespaced to the owning org's schema.
 */
const app = new Hono<{ Variables: AuthVar }>();

function canView(role: string | null | undefined, entity: { viewRole: string }): boolean {
  return isBuilder(role) || hasPersona(role, entity.viewRole);
}
function canEdit(role: string | null | undefined, entity: { editRole: string }): boolean {
  return isBuilder(role) || hasPersona(role, entity.editRole);
}

const idParam = z.coerce.number().int().positive();

function validationError(c: any, error: z.ZodError) {
  return c.json({ error: "Validation failed", details: z.treeifyError(error) }, 400);
}

async function validateRelations(
  fieldsMeta: any[],
  values: Record<string, unknown>,
): Promise<string | null> {
  for (const f of fieldsMeta) {
    if (f.type === "relation" && values[f.name] !== undefined && values[f.name] !== null) {
      const targetId = f.relationTableId;
      if (!targetId) continue;
      const [target] = await db
        .select({ slug: entities.slug, orgSlug: orgs.slug })
        .from(entities)
        .innerJoin(orgs, eq(orgs.id, entities.orgId))
        .where(eq(entities.id, targetId));
      if (!target) return `Relation field "${f.name}" has invalid target`;
      const id = Number(values[f.name]);
      if (!Number.isInteger(id) || id <= 0) return `Invalid relation id for "${f.name}"`;
      const res = await db.execute(
        sql`SELECT id FROM ${sql.identifier(target.orgSlug)}.${sql.identifier(target.slug)} WHERE id = ${id} LIMIT 1`,
      );
      const rows = (res as any).rows ?? res;
      if (Array.isArray(rows) && rows.length === 0) return `Related record ${id} not found for field "${f.name}"`;
    }
  }
  return null;
}

// Searchable lookup for relation fields: GET /:slug/lookup?search=term&limit=20
// Returns [{ id, label }] for dropdowns. Label is first text-like field or id.
app.get("/:orgSlug/:slug/lookup", async (c) => {
  const resolved = await getEntityBySlug(db, c.req.param("orgSlug"), c.req.param("slug"));
  if (!resolved) return c.json({ error: `Unknown entity "${c.req.param("slug")}"` }, 404);
  if (!canView(c.get("user")?.role, resolved.entity)) return c.json({ error: "You do not have access to this table" }, 403);
  const search = c.req.query("search")?.trim() ?? "";
  const limit = Math.min(Number(c.req.query("limit") ?? 20), 50);
  // Display field: caller may pin one via ?display= (validated); else first
  // text-like field, else the first field, else just ids.
  const requested = c.req.query("display")?.trim();
  const valid = requested && resolved.fields.some((f) => f.name === requested) ? requested : undefined;
  const displayField =
    valid ??
    resolved.fields.find((f) => ["text", "email", "phone", "select"].includes(f.type))?.name ??
    resolved.fields[0]?.name;
  const table = sql`${sql.identifier(resolved.orgSlug)}.${sql.identifier(resolved.entity.slug)}`;
  let rows: Record<string, unknown>[];
  if (search && displayField) {
    const res = await db.execute(sql`SELECT id, ${sql.identifier(displayField)} as label FROM ${table} WHERE CAST(${sql.identifier(displayField)} AS TEXT) ILIKE ${"%" + search + "%"} ORDER BY id LIMIT ${limit}`);
    const raw = (res as any).rows ?? (res as any);
    rows = (raw as any[]).map((r: any) => ({ id: r.id, label: String(r.label ?? r[displayField] ?? r.id) }));
  } else {
    const res = await db.execute(sql`SELECT id, ${displayField ? sql.identifier(displayField) : sql`id`} as label FROM ${table} ORDER BY id LIMIT ${limit}`);
    const raw = (res as any).rows ?? (res as any);
    rows = (raw as any[]).map((r: any) => ({ id: r.id, label: String(r.label ?? r.id) }));
  }
  return c.json(rows);
});

app.get("/:orgSlug/:slug", async (c) => {
  const resolved = await getEntityBySlug(db, c.req.param("orgSlug"), c.req.param("slug"));
  if (!resolved) return c.json({ error: `Unknown entity "${c.req.param("slug")}"` }, 404);
  if (!canView(c.get("user")?.role, resolved.entity)) return c.json({ error: "You do not have access to this table" }, 403);
  const rows = await listRows(db, resolved.orgSlug, resolved.entity.slug, resolved.fields.map((f) => f.name));
  // v0 limitation: flat list capped at 200 rows — no pagination yet.
  return c.json(rows);
});

app.post("/:orgSlug/:slug", async (c) => {
  const resolved = await getEntityBySlug(db, c.req.param("orgSlug"), c.req.param("slug"));
  if (!resolved) return c.json({ error: `Unknown entity "${c.req.param("slug")}"` }, 404);

  const schema = buildCreateSchema(resolved.fields as any);
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  if (!canEdit(c.get("user")?.role, resolved.entity)) return c.json({ error: "You do not have permission to add records here" }, 403);
  const values = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined && v !== null),
  );
  const relErr = await validateRelations(resolved.fields, values);
  if (relErr) return c.json({ error: relErr }, 400);
  const row = await insertRow(db, resolved.orgSlug, resolved.entity.slug, values);
  return c.json(row, 201);
});

app.get("/:orgSlug/:slug/:id", async (c) => {
  const resolved = await getEntityBySlug(db, c.req.param("orgSlug"), c.req.param("slug"));
  if (!resolved) return c.json({ error: `Unknown entity "${c.req.param("slug")}"` }, 404);
  if (!canView(c.get("user")?.role, resolved.entity)) return c.json({ error: "You do not have access to this table" }, 403);
  const id = idParam.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "Invalid id" }, 400);
  const row = await getRowById(db, resolved.orgSlug, resolved.entity.slug, resolved.fields.map((f) => f.name), id.data);
  if (!row) return c.json({ error: "Row not found" }, 404);
  return c.json(row);
});

app.put("/:orgSlug/:slug/:id", async (c) => {
  const resolved = await getEntityBySlug(db, c.req.param("orgSlug"), c.req.param("slug"));
  if (!resolved) return c.json({ error: `Unknown entity "${c.req.param("slug")}"` }, 404);
  const id = idParam.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "Invalid id" }, 400);

  const schema = buildUpdateSchema(resolved.fields as any);
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return validationError(c, parsed.error);

  const values = Object.fromEntries(
    Object.entries(parsed.data).filter(([, v]) => v !== undefined && v !== null),
  );
  if (!canEdit(c.get("user")?.role, resolved.entity)) return c.json({ error: "You do not have permission to edit records here" }, 403);
  if (Object.keys(values).length === 0) return c.json({ error: "No fields to update" }, 400);
  const relErr = await validateRelations(resolved.fields, values);
  if (relErr) return c.json({ error: relErr }, 400);

  const row = await updateRowById(db, resolved.orgSlug, resolved.entity.slug, values, id.data);
  if (!row) return c.json({ error: "Row not found" }, 404);
  return c.json(row);
});

app.delete("/:orgSlug/:slug/:id", async (c) => {
  const resolved = await getEntityBySlug(db, c.req.param("orgSlug"), c.req.param("slug"));
  if (!resolved) return c.json({ error: `Unknown entity "${c.req.param("slug")}"` }, 404);
  const id = idParam.safeParse(c.req.param("id"));
  if (!id.success) return c.json({ error: "Invalid id" }, 400);
  if (!canEdit(c.get("user")?.role, resolved.entity)) return c.json({ error: "You do not have permission to delete records here" }, 403);
  const deleted = await deleteRowById(db, resolved.orgSlug, resolved.entity.slug, id.data);
  if (!deleted) return c.json({ error: "Row not found" }, 404);
  return c.body(null, 204);
});

export default app;
