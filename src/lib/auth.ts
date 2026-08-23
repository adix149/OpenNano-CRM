import { sign, verify } from "hono/jwt";

const JWT_SECRET = process.env.JWT_SECRET ?? "dev-secret-change-me";
const JWT_ALG = "HS256" as const;

export interface JwtPayload {
  sub: number; // user id
  username: string;
  role: "admin" | "member";
  orgId: number | null;
  exp?: number;
}

export async function hashPassword(password: string): Promise<string> {
  return Bun.password.hash(password);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return Bun.password.verify(password, hash);
}

export async function createToken(payload: Omit<JwtPayload, "exp">): Promise<string> {
  return sign({ ...payload, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7 }, JWT_SECRET, JWT_ALG);
}

export async function verifyToken(token: string): Promise<JwtPayload> {
  return (await verify(token, JWT_SECRET, JWT_ALG)) as unknown as JwtPayload;
}

export function getTokenFromHeader(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice(7);
  const cookie = c.req.header("Cookie");
  if (cookie) {
    const m = cookie.match(/(?:^|;\s*)token=([^;]+)/);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}
