import type { Entity, EntityField } from "./api";

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

/** Picks a human-friendly display column for an entity (mirrors backend lookup). */
export function displayField(entity: Entity): EntityField | undefined {
  return (
    entity.fields.find((f) => ["text", "email", "phone", "select"].includes(f.type)) ??
    entity.fields[0]
  );
}

export function rowDisplayLabel(entity: Entity | undefined, row: Record<string, unknown> | undefined): string {
  if (!entity || !row) return "";
  const f = displayField(entity);
  const v = f ? row[f.name] : undefined;
  return v === null || v === undefined || v === "" ? `#${row.id}` : String(v);
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
