/**
 * OpenNano-CRM — Persona hierarchy
 *
 * Single source of truth for role ranking.
 * Used by both middleware and route handlers.
 */

export type Persona = "admin" | "developer" | "editor" | "viewer" | "member";

export const RANK: Record<Persona, number> = {
  viewer: 0,
  member: 0, // legacy alias
  editor: 1,
  developer: 2,
  admin: 3,
};

export function rank(role: string | null | undefined): number {
  return (RANK as Record<string, number>)[role ?? ""] ?? 0;
}

export function hasPersona(role: string | null | undefined, required: Persona): boolean {
  return rank(role) >= RANK[required];
}

export function isBuilder(role: string | null | undefined): boolean {
  return role === "admin" || role === "developer";
}

export const PERSONAS: Persona[] = ["viewer", "editor", "developer", "admin"];
