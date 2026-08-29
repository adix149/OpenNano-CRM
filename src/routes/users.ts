// @ts-nocheck
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/connection";
import { users } from "../db/schema";
import { hashPassword } from "../lib/auth";
import type { AuthVar } from "../lib/middleware";
import { requireAdmin } from "../lib/middleware";

const app = new Hono<{ Variables: AuthVar }>();

// Admin: list users
app.get("/", requireAdmin, async (c) => {
  const rows = await db.select({ id: users.id, username: users.username, displayName: users.displayName, role: users.role, orgId: users.orgId, createdAt: users.createdAt }).from(users);
  return c.json(rows);
});

// Admin: create user directly (alternative to /auth/register)
app.post(
  "/",
  requireAdmin,
  async (c) => {
    const body = z
      .object({ username: z.string().min(3), password: z.string().min(6), displayName: z.string().min(1), role: z.enum(["admin", "developer", "editor", "viewer"]).default("viewer"), orgId: z.number().int().optional() })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "Invalid body", details: z.treeifyError(body.error) }, 400);
    const [exists] = await db.select().from(users).where(eq(users.username, body.data.username));
    if (exists) return c.json({ error: "Username taken" }, 409);
    const passwordHash = await hashPassword(body.data.password);
    const [user] = await db.insert(users).values({ username: body.data.username, displayName: body.data.displayName, passwordHash, role: body.data.role, orgId: body.data.orgId as any ?? null }).returning();
    return c.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role }, 201);
  },
);

// Self or admin can update displayName/password/role(org)
app.patch(
  "/:id",
  async (c) => {
    const user = c.get("user");
    if (!user) return c.json({ error: "Not authenticated" }, 401);
    const id = Number(c.req.param("id"));
    if (Number.isNaN(id)) return c.json({ error: "Invalid id" }, 400);
    if (user.role !== "admin" && user.sub !== id) return c.json({ error: "Forbidden" }, 403);
    const body = z
      .object({ displayName: z.string().min(1).optional(), password: z.string().min(6).optional(), role: z.enum(["admin", "developer", "editor", "viewer"]).optional(), orgId: z.number().int().nullable().optional() })
      .safeParse(await c.req.json());
    if (!body.success) return c.json({ error: "Invalid body" }, 400);
    if (body.data.role && user.role !== "admin") return c.json({ error: "Only admin can change role" }, 403);
    const updates: Record<string, unknown> = {};
    if (body.data.displayName) updates.displayName = body.data.displayName;
    if (body.data.password) updates.passwordHash = await hashPassword(body.data.password);
    if (body.data.role) updates.role = body.data.role;
    if (body.data.orgId !== undefined) {
      if (user.role !== "admin") return c.json({ error: "Only admin can change org" }, 403);
      updates.orgId = body.data.orgId;
    }
    if (Object.keys(updates).length === 0) return c.json({ error: "Nothing to update" }, 400);
    const [updated] = await db.update(users).set(updates as any).where(eq(users.id, id)).returning();
    if (!updated) return c.json({ error: "User not found" }, 404);
    return c.json({ id: updated.id, username: updated.username, displayName: updated.displayName, role: updated.role });
  },
);

app.delete("/:id", requireAdmin, async (c) => {
  const id = Number(c.req.param("id"));
  const [deleted] = await db.delete(users).where(eq(users.id, id)).returning({ id: users.id });
  if (!deleted) return c.json({ error: "User not found" }, 404);
  return c.body(null, 204);
});

export default app;
