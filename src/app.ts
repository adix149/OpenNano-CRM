/**
 * OpenNano-CRM — Application factory
 *
 * Builds the Hono app with all middleware and routes.
 * Keeps `server.ts` (bootstrap) thin and testable.
 */

import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { authMiddleware } from "./lib/middleware";
import { handleError } from "./lib/errors";

import authRoutes from "./routes/auth";
import orgsRoutes, { projectApp } from "./routes/orgs";
import usersRoutes from "./routes/users";
import devRoutes from "./routes/dev";
import dataRoutes from "./routes/data";
import viewsRoutes from "./modules/views/views.routes";
import tablesRoutes from "./modules/tables/tables.routes";
import recordsRoutes from "./modules/records/records.routes";
import reportsRoutes from "./modules/reports/reports.routes";
import { db } from "./db/connection";
import { eq, inArray } from "drizzle-orm";

export function createApp() {
  const app = new Hono();

  // Auth is optional — populates c.get("user") when a valid token is present
  app.use("*", authMiddleware);

  app.get("/api/health", (c) => c.json({ ok: true, version: "0.1.0", name: "OpenNano-CRM" }));

  app.onError(handleError);

  // Public
  app.route("/api/auth", authRoutes);

  // Protected / hierarchy — canonical v0.1 + legacy (remove after frontend migrates)
  app.route("/api/organizations", orgsRoutes);
  app.route("/api/projects", projectApp);
  app.route("/api/users", usersRoutes);
  app.route("/api/dev", devRoutes);
  app.route("/api/data", dataRoutes);
  app.route("/api/organizations/:orgSlug/tables", tablesRoutes);
  app.route("/api/organizations/:orgSlug/tables/:tableSlug/records", recordsRoutes);
  app.route("/api/organizations/:orgSlug/tables/:tableSlug/views", viewsRoutes);
  app.route("/api/projects/:projectId/reports", reportsRoutes);

  // Hierarchy overview for dashboards
  app.get("/api/hierarchy", async (c) => {
    const { organizations, projects, tables, columns, reports } = await import("./db/schema");
    const user = c.get("user" as any) as any;
    const orgRows = user && !["admin", "developer"].includes(user.role)
      ? await db.select().from(organizations).where(eq(organizations.id, user.orgId))
      : await db.select().from(organizations);
    const orgIds = orgRows.map((org) => org.id);
    const [projRows, entRows, fieldRows, reportRows] = await Promise.all([
      orgIds.length ? db.select().from(projects).where(inArray(projects.orgId, orgIds)) : db.select().from(projects).where(eq(projects.id, -1)),
      orgIds.length ? db.select().from(tables).where(inArray(tables.orgId, orgIds)) : db.select().from(tables).where(eq(tables.id, -1)),
      db.select().from(columns),
      orgIds.length ? db.select().from(reports).innerJoin(projects, eq(reports.projectId, projects.id)).where(inArray(projects.orgId, orgIds)).then((rows) => rows.map(({ reports: report }) => report)) : Promise.resolve([]),
    ]);
    return c.json({ organizations: orgRows, orgs: orgRows, projects: projRows, tables: entRows, entities: entRows, columns: fieldRows, fields: fieldRows, reports: reportRows });
  });

  // SPA fallback — API routes above take precedence
  app.use("*", serveStatic({ root: "./web/dist" }));
  app.get("*", serveStatic({ root: "./web/dist", rewriteRequestPath: () => "/index.html" }));

  return app;
}
