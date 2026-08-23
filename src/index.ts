import { Hono } from "hono";
import { serve } from "bun";
import { migrate } from "drizzle-orm/bun-sql/migrator";
import { serveStatic } from "hono/bun";
import { db } from "./db";
import devRoutes from "./routes/dev";
import dataRoutes from "./routes/data";
import authRoutes from "./routes/auth";
import usersRoutes from "./routes/users";
import orgsRoutes, { projectApp } from "./routes/orgs";
import { authMiddleware } from "./lib/middleware";
import { ensureOrgSchema } from "./lib/dynamic-sql";

// Auto-migrate on boot: applies drizzle/ migrations after the db healthcheck.
await migrate(db, { migrationsFolder: "./drizzle" });

// Reconcile storage namespaces: every org owns one Postgres schema holding all
// of its dynamic tables. Ensures schemas exist for orgs created before this
// invariant, so backups/restore can always target a whole schema per org.
{
  const { orgs: orgsTable } = await import("./db/schema");
  const rows = await db.select().from(orgsTable);
  for (const o of rows) {
    try {
      await ensureOrgSchema(db, o.slug);
    } catch (e) {
      console.error(`Could not ensure schema for org "${o.slug}"`, e);
    }
  }
}

const app = new Hono();

// Global middleware — auth is optional, populates c.get("user") when token present
app.use("*", authMiddleware);

app.get("/api/health", (c) => c.json({ ok: true }));

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: "Internal server error" }, 500);
});

// Public auth routes
app.route("/api/auth", authRoutes);

// Hierarchy & user management (auth optional for now, but admin checks inside)
app.route("/api/orgs", orgsRoutes);
app.route("/api/projects", projectApp);
app.route("/api/users", usersRoutes);

// Existing dev/data routes (now project-aware, relation-aware)
app.route("/api/dev", devRoutes);
app.route("/api/data", dataRoutes);

// Hierarchy overview for frontend
app.get("/api/hierarchy", async (c) => {
  const { orgs: orgsTable, projects: projectsTable, entities: entitiesTable, fields: fieldsTable } = await import("./db/schema");
  const orgRows = await db.select().from(orgsTable);
  const projRows = await db.select().from(projectsTable);
  const entRows = await db.select().from(entitiesTable);
  const fieldRows = await db.select().from(fieldsTable);
  return c.json({ orgs: orgRows, projects: projRows, entities: entRows, fields: fieldRows });
});

// Serve the built Vue app (web/dist) with an SPA fallback. API routes above take precedence.
app.use("*", serveStatic({ root: "./web/dist" }));
app.get("*", serveStatic({ root: "./web/dist", rewriteRequestPath: () => "/index.html" }));

const port = Number(process.env.PORT ?? 3000);
serve({ fetch: app.fetch, port });
console.log(`NanoBlissCRM listening on http://localhost:${port}`);
console.log(`Hierarchy: Organization → Project → Entity (Table) → Record`);
