// @ts-nocheck
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/connection";
import { organizations, projects, tables } from "../db/schema";
import { ensureOrgSchema, renameOrgSchema, dropOrgSchema } from "../lib/dynamic-sql";
import { isBuilder } from "../lib/personas";
import type { AuthVar } from "../lib/middleware";

const app = new Hono<{ Variables: AuthVar }>();

const identifier = z.string().regex(/^[a-z][a-z0-9_]*$/, "must match ^[a-z][a-z0-9_]*$");

const createOrgBody = z.object({ slug: identifier, name: z.string().min(1), description: z.string().optional() });
const persona = z.enum(["viewer", "editor", "developer", "admin"]);
const updateOrgBody = z.object({
  slug: identifier.optional(),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  defaultViewRole: persona.optional(),
  defaultEditRole: persona.optional(),
}).strict();

app.get("/", async (c) => {
  const rows = await db.select().from(organizations).orderBy(organizations.id);
  return c.json(rows);
});

app.post("/", async (c) => {
  const parsed = createOrgBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body", details: z.treeifyError(parsed.error) }, 400);
  const [exists] = await db.select().from(organizations).where(eq(organizations.slug, parsed.data.slug));
  if (exists) return c.json({ error: "Org slug already exists" }, 409);
  const [org] = await db.insert(organizations).values({ slug: parsed.data.slug, name: parsed.data.name, description: parsed.data.description ?? null }).returning();
  // Every org owns a Postgres schema named after its slug — create it up front.
  await ensureOrgSchema(db, org.slug);
  return c.json(org, 201);
});

app.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
  if (!org) return c.json({ error: "Org not found" }, 404);
  const projs = await db.select().from(projects).where(eq(projects.organizationId, id)).orderBy(projects.id);
  return c.json({ ...org, projects: projs });
});

app.patch("/:id", async (c) => {
  if (!isBuilder(c.get("user")?.role)) return c.json({ error: "Developer or admin access required" }, 403);
  const id = Number(c.req.param("id"));
  const parsed = updateOrgBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
  if (Object.keys(parsed.data).length === 0) return c.json({ error: "Nothing to update" }, 400);
  const [current] = await db.select().from(organizations).where(eq(organizations.id, id));
  if (!current) return c.json({ error: "Org not found" }, 404);

  const newSlug = parsed.data.slug;
  // The org's Postgres schema is named after its slug — renaming the slug
  // renames the physical namespace holding every table of this org.
  if (newSlug && newSlug !== current.slug) {
    const [taken] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.slug, newSlug));
    if (taken) return c.json({ error: "Org slug already exists" }, 409);
    try {
      await renameOrgSchema(db, current.slug, newSlug);
    } catch {
      return c.json({ error: "Could not rename storage schema" }, 500);
    }
  }
  try {
    const [updated] = await db.update(organizations).set(parsed.data as any).where(eq(organizations.id, id)).returning();
    return c.json(updated);
  } catch (err) {
    // Keep the physical namespace aligned with the registry row.
    if (newSlug && newSlug !== current.slug) await renameOrgSchema(db, newSlug, current.slug).catch(() => {});
    throw err;
  }
});

app.delete("/:id", async (c) => {
  if (!isBuilder(c.get("user")?.role)) return c.json({ error: "Developer or admin access required" }, 403);
  const id = Number(c.req.param("id"));
  const [org] = await db.select().from(organizations).where(eq(organizations.id, id));
  if (!org) return c.json({ error: "Org not found" }, 404);
  // Dropping the schema removes every dynamic table this org owns.
  await db.delete(organizations).where(eq(organizations.id, id));
  await dropOrgSchema(db, org.slug).catch(() => {});
  return c.body(null, 204);
});

// ── Projects under org ──

const createProjectBody = z.object({ slug: identifier, name: z.string().min(1), description: z.string().optional() });
const updateProjectBody = z.object({ slug: identifier.optional(), name: z.string().min(1).optional(), description: z.string().optional() }).strict();

app.get("/:orgId/projects", async (c) => {
  const orgId = Number(c.req.param("orgId"));
  const rows = await db.select().from(projects).where(eq(projects.organizationId, orgId)).orderBy(projects.id);
  return c.json(rows);
});

app.post("/:orgId/projects", async (c) => {
  if (!isBuilder(c.get("user")?.role)) return c.json({ error: "Developer or admin access required" }, 403);
  const orgId = Number(c.req.param("orgId"));
  const [org] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) return c.json({ error: "Org not found" }, 404);
  const parsed = createProjectBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
  const [exists] = await db.select().from(projects).where(eq(projects.slug, parsed.data.slug));
  // check per-org uniqueness is enforced by index, but we check manually
  const [dup] = await db.select().from(projects).where(eq(projects.organizationId, orgId));
  // simpler: try insert and catch
  try {
    const [proj] = await db.insert(projects).values({ slug: parsed.data.slug, name: parsed.data.name, description: parsed.data.description ?? null, orgId: orgId }).returning();
    return c.json(proj, 201);
  } catch (e: any) {
    if (String(e.message).includes("projects_org_id_slug_idx") || String(e.message).includes("unique")) return c.json({ error: "Project slug already exists in this org" }, 409);
    throw e;
  }
});

// Standalone project list / detail for convenience
const projectApp = new Hono<{ Variables: AuthVar }>();
projectApp.get("/", async (c) => {
  const rows = await db.select().from(projects).orderBy(projects.id);
  // attach org and entity counts
  return c.json(rows);
});
projectApp.get("/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const [proj] = await db.select().from(projects).where(eq(projects.id, id));
  if (!proj) return c.json({ error: "Project not found" }, 404);
  const ents = await db.select().from(tables).where(eq(tables.projectId, id));
  return c.json({ ...proj, tables: ents });
});
projectApp.patch("/:id", async (c) => {
  if (!isBuilder(c.get("user")?.role)) return c.json({ error: "Developer or admin access required" }, 403);
  const id = Number(c.req.param("id"));
  const parsed = updateProjectBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
  const [updated] = await db.update(projects).set(parsed.data as any).where(eq(projects.id, id)).returning();
  if (!updated) return c.json({ error: "Project not found" }, 404);
  return c.json(updated);
});
projectApp.delete("/:id", async (c) => {
  if (!isBuilder(c.get("user")?.role)) return c.json({ error: "Developer or admin access required" }, 403);
  const id = Number(c.req.param("id"));
  const [deleted] = await db.delete(projects).where(eq(projects.id, id)).returning({ id: projects.id });
  if (!deleted) return c.json({ error: "Project not found" }, 404);
  return c.body(null, 204);
});

export { projectApp };
export default app;
