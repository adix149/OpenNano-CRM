import { Hono } from "hono";
import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "../../db/connection";
import { columns, organizations, projects, reports, tables } from "../../db/schema";
import { isBuilder } from "../permissions/personas";
import type { AuthVar } from "../../lib/middleware";
import { renderReportPdf } from "../records/pdf.service";

const app = new Hono<{ Variables: AuthVar }>();
const identifier = z.string().regex(/^[a-z][a-z0-9_]*$/);
const block = z.object({
  id: z.string().min(1),
  tableId: z.number().int().positive(),
  columnId: z.number().int().positive(),
  label: z.string().min(1),
  width: z.enum(["full", "half", "third"]).default("half"),
  kind: z.enum(["field", "heading", "spacer"]).default("field"),
  text: z.string().optional(),
});
const layout = z.object({
  title: z.string().min(1).default("Report"),
  subtitle: z.string().optional(),
  blocks: z.array(block).default([]),
});
const reportBody = z.object({
  slug: identifier,
  label: z.string().min(1),
  description: z.string().optional(),
  layout,
});
const reportPatch = reportBody.partial().strict();

async function projectScope(projectId: number) {
  const [project] = await db.select().from(projects).where(eq(projects.id, projectId));
  if (!project) return null;
  const [org] = await db.select().from(organizations).where(eq(organizations.id, project.orgId));
  return org ? { project, org } : null;
}

async function validateBlocks(orgId: number, input: z.infer<typeof layout>) {
  const fieldBlocks = input.blocks.filter((item) => item.kind === "field");
  if (!fieldBlocks.length) return input;
  const tableIds = [...new Set(fieldBlocks.map((item) => item.tableId))];
  const tableRows = await db.select().from(tables).where(and(inArray(tables.id, tableIds), eq(tables.orgId, orgId)));
  const tableMap = new Map(tableRows.map((table) => [table.id, table]));
  const columnRows = await db.select().from(columns).where(inArray(columns.id, fieldBlocks.map((item) => item.columnId)));
  const columnMap = new Map(columnRows.map((column) => [column.id, column]));
  for (const item of fieldBlocks) {
    const table = tableMap.get(item.tableId);
    const column = columnMap.get(item.columnId);
    if (!table || !column || column.entityId !== table.id) throw new Error("Every report field must belong to a table in the project organization");
  }
  return input;
}

app.get("/", async (c) => {
  const scope = await projectScope(Number(c.req.param("projectId")));
  if (!scope) return c.json({ error: "Project not found" }, 404);
  const rows = await db.select().from(reports).where(eq(reports.projectId, scope.project.id)).orderBy(reports.id);
  return c.json(rows);
});

app.post("/", async (c) => {
  if (!isBuilder(c.get("user")?.role)) return c.json({ error: "Developer or admin access required" }, 403);
  const scope = await projectScope(Number(c.req.param("projectId")));
  if (!scope) return c.json({ error: "Project not found" }, 404);
  const parsed = reportBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid report", details: parsed.error.flatten() }, 400);
  try {
    await validateBlocks(scope.org.id, parsed.data.layout);
    const [report] = await db.insert(reports).values({ ...parsed.data, projectId: scope.project.id, description: parsed.data.description ?? null }).returning();
    return c.json(report, 201);
  } catch (error) {
    if (String(error).includes("unique")) return c.json({ error: "Report slug already exists in this project" }, 409);
    throw error;
  }
});

app.get("/:reportId", async (c) => {
  const scope = await projectScope(Number(c.req.param("projectId")));
  if (!scope) return c.json({ error: "Project not found" }, 404);
  const [report] = await db.select().from(reports).where(and(eq(reports.id, Number(c.req.param("reportId"))), eq(reports.projectId, scope.project.id)));
  if (!report) return c.json({ error: "Report not found" }, 404);
  return c.json(report);
});

app.patch("/:reportId", async (c) => {
  if (!isBuilder(c.get("user")?.role)) return c.json({ error: "Developer or admin access required" }, 403);
  const scope = await projectScope(Number(c.req.param("projectId")));
  if (!scope) return c.json({ error: "Project not found" }, 404);
  const parsed = reportPatch.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid report", details: parsed.error.flatten() }, 400);
  if (parsed.data.layout) await validateBlocks(scope.org.id, parsed.data.layout);
  const [updated] = await db.update(reports).set(parsed.data as any).where(and(eq(reports.id, Number(c.req.param("reportId"))), eq(reports.projectId, scope.project.id))).returning();
  if (!updated) return c.json({ error: "Report not found" }, 404);
  return c.json(updated);
});

app.delete("/:reportId", async (c) => {
  if (!isBuilder(c.get("user")?.role)) return c.json({ error: "Developer or admin access required" }, 403);
  const [deleted] = await db.delete(reports).where(and(eq(reports.id, Number(c.req.param("reportId"))), eq(reports.projectId, Number(c.req.param("projectId"))))).returning({ id: reports.id });
  if (!deleted) return c.json({ error: "Report not found" }, 404);
  return c.body(null, 204);
});

app.post("/:reportId/pdf", async (c) => {
  const scope = await projectScope(Number(c.req.param("projectId")));
  if (!scope) return c.json({ error: "Project not found" }, 404);
  const [report] = await db.select().from(reports).where(and(eq(reports.id, Number(c.req.param("reportId"))), eq(reports.projectId, scope.project.id)));
  if (!report) return c.json({ error: "Report not found" }, 404);
  const pdf = await renderReportPdf({ report: report as any, projectLabel: scope.project.name, organizationLabel: scope.org.name });
  return new Response(pdf as any, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${report.slug}.pdf"` } });
});

export default app;
