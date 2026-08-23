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
import { db } from "./db";

export function createApp() {
  const app = new Hono();

  // Auth is optional — populates c.get("user") when a valid token is present
  app.use("*", authMiddleware);

  app.get("/api/health", (c) => c.json({ ok: true, version: "0.1.0", name: "OpenNano-CRM" }));

  app.onError(handleError);

  // Public
  app.route("/api/auth", authRoutes);

  // Protected / hierarchy
  app.route("/api/orgs", orgsRoutes);
  app.route("/api/projects", projectApp);
  app.route("/api/users", usersRoutes);
  app.route("/api/dev", devRoutes);
  app.route("/api/data", dataRoutes);

  // Hierarchy overview for dashboards
  app.get("/api/hierarchy", async (c) => {
    const { orgs, projects, entities, fields } = await import("./db/schema");
    const [orgRows, projRows, entRows, fieldRows] = await Promise.all([
      db.select().from(orgs),
      db.select().from(projects),
      db.select().from(entities),
      db.select().from(fields),
    ]);
    return c.json({ orgs: orgRows, projects: projRows, entities: entRows, fields: fieldRows });
  });

  // SPA fallback — API routes above take precedence
  app.use("*", serveStatic({ root: "./web/dist" }));
  app.get("*", serveStatic({ root: "./web/dist", rewriteRequestPath: () => "/index.html" }));

  return app;
}
