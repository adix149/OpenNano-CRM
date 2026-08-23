import type { Context, Next } from "hono";
import { verifyToken, getTokenFromHeader } from "./auth";
import type { JwtPayload } from "./auth";

export type AuthVar = { user: JwtPayload | null };

export async function authMiddleware(c: Context<{ Variables: AuthVar }>, next: Next) {
  const token = getTokenFromHeader(c);
  if (!token) {
    c.set("user", null);
    await next();
    return;
  }
  try {
    const payload = await verifyToken(token);
    c.set("user", payload);
  } catch {
    c.set("user", null);
  }
  await next();
}

export async function requireAuth(c: Context<{ Variables: AuthVar }>, next: Next) {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  await next();
}

export async function requireAdmin(c: Context<{ Variables: AuthVar }>, next: Next) {
  const user = c.get("user");
  if (!user) return c.json({ error: "Not authenticated" }, 401);
  if (user.role !== "admin") return c.json({ error: "Admin only" }, 403);
  await next();
}
