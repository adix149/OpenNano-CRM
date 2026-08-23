/** Mirror of backend src/lib/personas.ts */
export const PERSONA_RANK: Record<string, number> = {
  viewer: 0,
  member: 0,
  editor: 1,
  developer: 2,
  admin: 3,
};

export function rank(role: string | null | undefined): number {
  return role ? PERSONA_RANK[role] ?? 0 : 0;
}

export function hasPersona(role: string | null | undefined, required: string): boolean {
  return rank(role) >= (PERSONA_RANK[required] ?? 0);
}

export function isBuilder(role: string | null | undefined): boolean {
  return role === "admin" || role === "developer";
}
