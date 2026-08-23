/**
 * Persona hierarchy shared by routes: viewer(0) < editor(1) < developer(2) < admin(3).
 * "member" is a legacy alias of viewer. Unknown roles rank as viewer.
 */
export type Persona = "admin" | "developer" | "editor" | "viewer" | "member";

export const PERSONA_RANK: Record<string, number> = {
  viewer: 0,
  member: 0,
  editor: 1,
  developer: 2,
  admin: 3,
};

export function rank(role: string | null | undefined): number {
  if (!role) return 0;
  return PERSONA_RANK[role] ?? 0;
}

/** True when the user's persona meets the minimum required for an action. */
export function hasPersona(role: string | null | undefined, required: string): boolean {
  return rank(role) >= (PERSONA_RANK[required] ?? 0);
}

/** Builders can change structure and access settings. */
export function isBuilder(role: string | null | undefined): boolean {
  return role === "admin" || role === "developer";
}
