import { Hono } from "hono";
import { getTableBySlug } from "../../lib/registry";
import { hasPersona } from "../permissions/personas";
import type { AuthVar } from "../../lib/middleware";
import { listRows, getRowById, insertRow, updateRowById, deleteRowById } from "../../lib/dynamic-sql";
import { buildCreateSchema, buildUpdateSchema } from "../../lib/meta-schema";
import { db } from "../../db/connection";

const app = new Hono<{ Variables: AuthVar }>();

function canView(role: string | undefined, table: any) {
  return role === "admin" || role === "developer" || (table.viewRole ? hasPersona(role, table.viewRole) : true);
}
function canEdit(role: string | undefined, table: any) {
  return role === "admin" || role === "developer" || hasPersona(role, table.editRole ?? "editor");
}

app.get("/", async (c) => {
  const { orgSlug, tableSlug } = c.req.param() as any;
  const resolved = await getTableBySlug(db, orgSlug, tableSlug);
  if (!resolved) return c.json({ error: "Table not found" }, 404);
  if (!canView(c.get("user")?.role, resolved.entity)) return c.json({ error: "Forbidden" }, 403);
  const rows = await listRows(db, resolved.orgSlug, resolved.entity.slug, resolved.columns.map((f) => f.name));
  return c.json(rows);
});

app.post("/", async (c) => {
  const { orgSlug, tableSlug } = c.req.param() as any;
  const resolved = await getTableBySlug(db, orgSlug, tableSlug);
  if (!resolved) return c.json({ error: "Table not found" }, 404);
  if (!canEdit(c.get("user")?.role, resolved.entity)) return c.json({ error: "Forbidden" }, 403);
  const schema = buildCreateSchema(resolved.columns as any);
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body", details: parsed.error.flatten() }, 400);
  const row = await insertRow(db, resolved.orgSlug, resolved.entity.slug, parsed.data as any);
  return c.json(row, 201);
});

app.get("/:id", async (c) => {
  const { orgSlug, tableSlug, id } = c.req.param() as any;
  const resolved = await getTableBySlug(db, orgSlug, tableSlug);
  if (!resolved) return c.json({ error: "Table not found" }, 404);
  if (!canView(c.get("user")?.role, resolved.entity)) return c.json({ error: "Forbidden" }, 403);
  const row = await getRowById(db, resolved.orgSlug, resolved.entity.slug, resolved.columns.map((f) => f.name), Number(id));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

app.put("/:id", async (c) => {
  const { orgSlug, tableSlug, id } = c.req.param() as any;
  const resolved = await getTableBySlug(db, orgSlug, tableSlug);
  if (!resolved) return c.json({ error: "Table not found" }, 404);
  if (!canEdit(c.get("user")?.role, resolved.entity)) return c.json({ error: "Forbidden" }, 403);
  const schema = buildUpdateSchema(resolved.columns as any);
  const parsed = schema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body", details: parsed.error.flatten() }, 400);
  const row = await updateRowById(db, resolved.orgSlug, resolved.entity.slug, parsed.data as any, Number(id));
  if (!row) return c.json({ error: "Not found" }, 404);
  return c.json(row);
});

app.delete("/:id", async (c) => {
  const { orgSlug, tableSlug, id } = c.req.param() as any;
  const resolved = await getTableBySlug(db, orgSlug, tableSlug);
  if (!resolved) return c.json({ error: "Table not found" }, 404);
  if (!canEdit(c.get("user")?.role, resolved.entity)) return c.json({ error: "Forbidden" }, 403);
  const ok = await deleteRowById(db, resolved.orgSlug, resolved.entity.slug, Number(id));
  if (!ok) return c.json({ error: "Not found" }, 404);
  return c.body(null, 204);
});

app.get("/lookup", async (c) => {
  const { orgSlug, tableSlug } = c.req.param() as any;
  const resolved = await getTableBySlug(db, orgSlug, tableSlug);
  if (!resolved) return c.json({ error: "Table not found" }, 404);
  if (!canView(c.get("user")?.role, resolved.entity)) return c.json({ error: "Forbidden" }, 403);
  const q = c.req.query("search") ?? "";
  const display = c.req.query("display");
  const { sql } = await import("drizzle-orm");
  const field = display && resolved.columns.find((f) => f.name === display) ? display : resolved.columns.find((f) => ["text","email","phone","select"].includes(f.type))?.name ?? resolved.columns[0]?.name;
  if (!field) return c.json([]);
  console.log("DEBUG: orgSlug:", resolved.orgSlug, "tableSlug:", resolved.entity.slug, "field:", field, "q:", q);
  const rows = await (await import("../../db/connection")).db.execute(sql`SELECT id, ${sql.identifier(field)} as label FROM ${sql.identifier(resolved.orgSlug)}.${sql.identifier(resolved.entity.slug)} WHERE CAST(${sql.identifier(field)} AS TEXT) ILIKE ${"%" + q + "%"} LIMIT 20`);
  console.log("DEBUG: rows:", rows);
  return c.json((rows as any).rows ?? rows);
});

export default app;
