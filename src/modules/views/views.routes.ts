import { Hono } from "hono";
import { isBuilder } from "../permissions/personas";
import type { AuthVar } from "../../lib/middleware";
import { createViewSchema, updateViewSchema } from "./views.schema";
import * as service from "./views.service";

const app = new Hono<{ Variables: AuthVar }>();

// All view mutations are builder-only (developers + admins)
app.use("*", async (c, next) => {
  if (c.req.method !== "GET" && !isBuilder(c.get("user")?.role)) {
    return c.json({ error: "Developer or admin access required" }, 403);
  }
  await next();
});

app.get("/", async (c) => {
  const orgSlug = c.req.param("orgSlug") as string;
  const tableSlug = c.req.param("tableSlug") as string;
  const { table } = await service.resolveTable(orgSlug, tableSlug);
  const rows = await service.listViews(table.orgId, table.id);
  return c.json(rows);
});

app.post("/", async (c) => {
  const orgSlug = c.req.param("orgSlug") as string;
  const tableSlug = c.req.param("tableSlug") as string;
  const parsed = createViewSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body", details: parsed.error.flatten() }, 400);
  const { table } = await service.resolveTable(orgSlug, tableSlug);
  const view = await service.createView(table.orgId, table.id, parsed.data);
  return c.json(view, 201);
});

app.get("/:viewSlug", async (c) => {
  const { orgSlug, tableSlug, viewSlug } = c.req.param() as any;
  const { table } = await service.resolveTable(orgSlug, tableSlug);
  const view = await service.getView(table.orgId, table.id, viewSlug);
  return c.json(view);
});

app.patch("/:viewSlug", async (c) => {
  const { orgSlug, tableSlug, viewSlug } = c.req.param() as any;
  const parsed = updateViewSchema.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body", details: parsed.error.flatten() }, 400);
  const { table } = await service.resolveTable(orgSlug, tableSlug);
  const updated = await service.updateView(table.orgId, table.id, viewSlug, parsed.data);
  return c.json(updated);
});

app.delete("/:viewSlug", async (c) => {
  const { orgSlug, tableSlug, viewSlug } = c.req.param() as any;
  const { table } = await service.resolveTable(orgSlug, tableSlug);
  await service.deleteView(table.orgId, table.id, viewSlug);
  return c.body(null, 204);
});

app.post("/:viewSlug/pdf", async (c) => {
  const { orgSlug, tableSlug, viewSlug } = c.req.param() as any;
  const recordId = Number(c.req.query("recordId"));
  if (!recordId) return c.json({ error: "recordId query required" }, 400);
  const { table } = await service.resolveTable(orgSlug, tableSlug);
  const view = await service.getView(table.orgId, table.id, viewSlug);
  const { getTableBySlug } = await import("../../lib/registry");
  const { db } = await import("../../db/connection");
  const resolved = await getTableBySlug(db, orgSlug, tableSlug);
  if (!resolved) return c.json({ error: "Table not found" }, 404);
  const { getRowById } = await import("../../lib/dynamic-sql");
  const row = await getRowById(db, resolved.orgSlug, resolved.entity.slug, resolved.columns.map((f) => f.name), recordId);
  if (!row) return c.json({ error: "Record not found" }, 404);
  const { renderPdf } = await import("../records/pdf.service");
  const pdf = await renderPdf({ layout: (view as any).layout, record: row as any, tableLabel: resolved.entity.label });
  return new Response(pdf as any, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="${tableSlug}-${recordId}.pdf"` } });
});

export default app;
