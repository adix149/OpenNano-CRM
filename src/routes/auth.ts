// @ts-nocheck
import { Hono } from "hono";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/connection";
import { users } from "../db/schema";
import { organizations as orgsTable } from "../db/schema";
import { createToken, hashPassword, verifyPassword, verifyToken, getTokenFromHeader } from "../lib/auth";

const app = new Hono();

const registerBody = z.object({
  username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_\-.]+$/),
  password: z.string().min(6).max(100),
  displayName: z.string().min(1).max(50),
  role: z.enum(["admin", "developer", "editor", "viewer"]).optional(),
  /** Bind the account to this organization (slug). */
  orgSlug: z.string().regex(/^[a-z][a-z0-9_]*$/).optional(),
});

app.post("/register", async (c) => {
  const parsed = registerBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body", details: z.treeifyError(parsed.error) }, 400);
  const { username, password, displayName, role } = parsed.data;
const orgSlug = parsed.data.orgSlug;
  if (orgSlug) {
    const [orgRow] = await db.select().from(orgsTable).where(eq(orgsTable.slug, orgSlug));
    if (!orgRow) return c.json({ error: "Organization not found" }, 400);
    var orgIdForUser: number | null = orgRow.id;
  } else {
    var orgIdForUser: number | null = null;
  }

  const [existing] = await db.select().from(users).where(eq(users.username, username));
  if (existing) return c.json({ error: "Username already taken" }, 409);

  const count = await db.select().from(users);
  const isFirstUser = count.length === 0;
  const finalRole = isFirstUser ? "admin" : (role ?? "viewer");

  // Only admin can create admin users after the first
  if (!isFirstUser && finalRole === "admin") {
    const token = getTokenFromHeader(c);
    if (!token) return c.json({ error: "Only admin can create admin users" }, 403);
    try {
      const payload = await verifyToken(token);
      if (payload.role !== "admin") return c.json({ error: "Only admin can create admin users" }, 403);
    } catch {
      return c.json({ error: "Invalid token" }, 401);
    }
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db
    .insert(users)
    .values({ username, displayName, passwordHash, role: finalRole, orgId: orgIdForUser } as any)
    .returning();
  const token = await createToken({ sub: user.id, username: user.username, role: user.role as any, orgId: user.orgId });
  return c.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, orgId: user.orgId, token });
});

const loginBody = z.object({
  username: z.string(),
  password: z.string(),
  /** Chosen organization; rejected when it does not match the account's binding. */
  orgSlug: z.string().optional(),
});

app.post("/login", async (c) => {
  const parsed = loginBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body" }, 400);
  const [user] = await db.select().from(users).where(eq(users.username, parsed.data.username));
  if (!user) return c.json({ error: "Invalid credentials" }, 401);
  if (parsed.data.orgSlug) {
    const [orgRow] = await db.select().from(orgsTable).where(eq(orgsTable.slug, parsed.data.orgSlug));
    if (!orgRow || user.organizationId !== orgRow.id) return c.json({ error: "Invalid credentials for this organization" }, 401);
  }
  const ok = await verifyPassword(parsed.data.password, user.passwordHash);
  if (!ok) return c.json({ error: "Invalid credentials" }, 401);
  const token = await createToken({ sub: user.id, username: user.username, role: user.role as any, orgId: user.orgId });
  // Also set httpOnly cookie for browser clients
  c.header("Set-Cookie", `token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 7}`);
  return c.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, orgId: user.orgId, token });
});

app.post("/logout", (c) => {
  c.header("Set-Cookie", "token=; Path=/; HttpOnly; Max-Age=0");
  return c.json({ ok: true });
});

app.get("/me", async (c) => {
  const token = getTokenFromHeader(c);
  if (!token) return c.json({ error: "Not authenticated" }, 401);
  try {
    const payload = await verifyToken(token);
    const [user] = await db.select().from(users).where(eq(users.id, payload.sub));
    if (!user) return c.json({ error: "User not found" }, 404);
    return c.json({ id: user.id, username: user.username, displayName: user.displayName, role: user.role, orgId: user.orgId });
  } catch {
    return c.json({ error: "Invalid token" }, 401);
  }
});

export default app;
