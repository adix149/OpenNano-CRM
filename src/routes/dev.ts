// @ts-nocheck
import { Hono } from "hono";
import { z } from "zod";
import { eq, and, inArray } from "drizzle-orm";
import { db } from "../db/connection";
import { tables, columns, columnOptions, projects, organizations } from "../db/schema";
import {
  ensureOrgSchema,
  createEntityTable,
  dropEntityTable,
  addFieldColumn,
  dropColumnIfExists,
  changeColumnType,
  renameColumn,
  renameEntityTable,
  countRows,
  IdentifierError,
  type FieldType,
} from "../lib/dynamic-sql";
import { getEntityBySlug } from "../lib/registry";
import { isBuilder } from "../lib/personas";
import type { AuthVar } from "../lib/middleware";

// TODO(v1): this whole router is unauthenticated in v0. Auth middleware mounts
// once at the top of src/index.ts; authorization for /dev-vs-/app slots in there.

const app = new Hono<{ Variables: AuthVar }>();

// The whole Dev surface restructures the backend — builders only.
app.use("*", async (c, next) => {
  if (!isBuilder(c.get("user")?.role)) {
    return c.json({ error: "Developer or admin access required" }, 403);
  }
  await next();
});

const identifierSchema = z.string().regex(/^[a-z][a-z0-9_]*$/, "must match ^[a-z][a-z0-9_]*$");

const createEntityBody = z
  .object({
    slug: identifierSchema,
    label: z.string().min(1),
    /** Scope: exactly one of these must be provided. */
    projectId: z.number().int().positive().optional(),
    projectSlug: z.string().optional(),
    orgId: z.number().int().positive().optional(),
    viewRole: z.enum(["viewer", "editor", "developer", "admin"]).optional(),
    editRole: z.enum(["viewer", "editor", "developer", "admin"]).optional(),
  })
  .refine((d) => d.projectId !== undefined || d.projectSlug !== undefined || d.orgId !== undefined, {
    message: "Provide orgId (organization-wide) or projectId/projectSlug (project-scoped)",
  });

const createFieldBody = z.object({
  name: identifierSchema,
  label: z.string().min(1),
  type: z.enum([
    "text",
    "number",
    "decimal",
    "boolean",
    "date",
    "datetime",
    "email",
    "phone",
    "url",
    "location",
    "select",
    "relation",
  ]),
  is_required: z.boolean().default(false),
  /** Show this field on the record detail page. */
  in_detail: z.boolean().optional(),
  /** Predetermined values; required for select columns, ignored otherwise. */
  options: z.array(z.string().min(1)).min(1).optional(),
  /** For relation columns: target entity slug or id */
  relationEntityId: z.number().int().positive().optional(),
  relationEntitySlug: z.string().optional(),
  /** Column of the target table used as the linking/display key. */
  relationFieldName: z.string().optional(),
});

/** Replaces the option set of a select field. */
const optionsBody = z.object({ options: z.array(z.string().min(1)).min(1) }).strict();

async function replaceOptions(fieldId: number, values: string[]) {
  await db.delete(columnOptions).where(eq(columnOptions.fieldId, fieldId));
  await db.insert(columnOptions).values(values.map((value, i) => ({ fieldId: fieldId, value, sortOrder: i })));
}

async function attachOptions(fieldIds: number[]) {
  const rows =
    fieldIds.length > 0
      ? await db
          .select()
          .from(columnOptions)
          .where(inArray(columnOptions.fieldId, fieldIds))
          .orderBy(columnOptions.sortOrder, columnOptions.id)
      : [];
  const map = new Map<number, string[]>();
  for (const r of rows) {
    const list = map.get(r.fieldId) ?? [];
    list.push(r.value);
    map.set(r.fieldId, list);
  }
  return map;
}

/** Drizzle wraps driver errors; the Postgres message lives on `.cause`. */
function pgErrorMessage(e: unknown): string {
  const err = e as any;
  return String(err?.cause?.message ?? err?.message ?? "");
}

interface EntityScope {
  orgId: number;
  orgSlug: string;
  projectId: number | null;
}

/** Resolves the requested hierarchy scope into concrete ids. */
async function resolveScope(data: {
  projectId?: number;
  projectSlug?: string;
  orgId?: number;
}): Promise<EntityScope> {
  if (data.projectId !== undefined || data.projectSlug !== undefined) {
    const [proj] = data.projectId
      ? await db.select().from(projects).where(eq(projects.id, data.projectId))
      : await db.select().from(projects).where(eq(projects.slug, data.projectSlug!));
    if (!proj) throw new Error("Project not found");
    const [org] = await db.select().from(organizations).where(eq(organizations.id, proj.orgId));
    if (!org) throw new Error("Project has no organization");
    return { orgId: org.id, orgSlug: org.slug, projectId: proj.id };
  }
  const [org] = await db.select().from(organizations).where(eq(organizations.id, data.orgId!));
  if (!org) throw new Error("Organization not found");
  return { orgId: org.id, orgSlug: org.slug, projectId: null };
}

// All keys optional; at least one must be present (checked in the handler).
const updateEntityBody = z
  .object({
    slug: identifierSchema.optional(),
    label: z.string().min(1).optional(),
    viewRole: z.enum(["viewer", "editor", "developer", "admin"]).optional(),
    editRole: z.enum(["viewer", "editor", "developer", "admin"]).optional(),
  })
  .strict();

const updateFieldBody = z
  .object({
    name: identifierSchema.optional(),
    label: z.string().min(1).optional(),
    type: z.enum([
      "text",
      "number",
      "decimal",
      "boolean",
      "date",
      "datetime",
      "email",
      "phone",
      "url",
      "location",
      "select",
      "relation",
    ]).optional(),
    is_required: z.boolean().optional(),
    in_detail: z.boolean().optional(),
    /** Replaces the option set; only valid on select columns. */
    options: z.array(z.string().min(1)).min(1).optional(),
    relationEntityId: z.number().int().positive().optional(),
    relationEntitySlug: z.string().optional(),
    relationFieldName: z.string().optional(),
  })
  .strict();

app.onError((err, c) => {
  if (err instanceof IdentifierError) {
    return c.json({ error: err.message }, 400);
  }
  throw err;
});

app.post("/entities", async (c) => {
  const parsed = createEntityBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body", details: z.treeifyError(parsed.error) }, 400);
  const { slug, label } = parsed.data;

  let scope: EntityScope;
  try {
    scope = await resolveScope(parsed.data);
  } catch (e: any) {
    return c.json({ error: e.message }, 400);
  }

  // Slug must be unique inside the owning org (both scopes share this space).
  const [existing] = await db
    .select({ id: entities.id })
    .from(tables)
    .where(and(eq(tables.orgId, scope.orgId), eq(tables.slug, slug)));
  if (existing) return c.json({ error: `Entity "${slug}" already exists in organization "${scope.orgSlug}"` }, 409);

  await ensureOrgSchema(db, scope.orgSlug);

  // DDL first; if metadata insert fails we roll the table back so Postgres
  // state never diverges from the registry.
  try {
    await createEntityTable(db, scope.orgSlug, slug);
  } catch (e) {
    // Self-heal: a physical table without a registry row means a previous
    // attempt crashed between DDL and metadata insert. Drop the orphan and retry.
    if (pgErrorMessage(e).includes("already exists")) {
      await dropEntityTable(db, scope.orgSlug, slug);
      await createEntityTable(db, scope.orgSlug, slug);
    } else {
      throw e;
    }
  }
  try {
    const [orgRow] = await db.select().from(organizations).where(eq(organizations.id, scope.orgId));
    const [entity] = await db
      .insert(entities)
      .values({
        slug,
        label,
        orgId: scope.orgId,
        projectId: scope.projectId,
        viewRole: parsed.data.viewRole ?? orgRow.defaultViewRole,
        editRole: parsed.data.editRole ?? orgRow.defaultEditRole,
      })
      .returning();
    return c.json(entity, 201);
  } catch (err) {
    await dropEntityTable(db, scope.orgSlug, slug).catch(() => {});
    throw err;
  }
});

app.get("/entities", async (c) => {
  const entityRows = await db
    .select({ entity: tables, orgSlug: organizations.slug })
    .from(tables)
    .innerJoin(organizations, eq(organizations.id, tables.orgId))
    .orderBy(tables.id);
  const fieldRows = await db.select().from(columns).orderBy(columns.sortOrder, columns.id);
  const optionMap = await attachOptions(fieldRows.map((f) => f.id));
  const result = entityRows.map(({ entity: e, orgSlug }) => ({
    ...e,
    orgSlug,
    columns: fieldRows
      .filter((f) => f.tableId === e.id)
      .map((f) => ({ ...f, options: optionMap.get(f.id) ?? [] })),
  }));
  return c.json(result);
});

app.post("/entities/:orgSlug/:slug/columns", async (c) => {
  const slug = c.req.param("slug");
  const resolved = await getEntityBySlug(db, c.req.param("orgSlug"), slug);
  if (!resolved) return c.json({ error: `Entity "${slug}" not found` }, 404);

  const parsed = createFieldBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body", details: z.treeifyError(parsed.error) }, 400);
  const { name, label, type, is_required, relationEntityId, relationEntitySlug } = parsed.data as any;
  const relationFieldName = (parsed.data as any).relationFieldName as string | undefined;

  if (name === "id" || name === "created_at") {
    return c.json({ error: `Field name "${name}" is reserved` }, 409);
  }
  if (resolved.columns.some((f) => f.name === name)) {
    return c.json({ error: `Field "${name}" already exists on "${slug}"` }, 409);
  }
  if (type === "select" && (!parsed.data.options || (parsed.data.options as string[]).length === 0)) {
    return c.json({ error: "Select columns require at least one option" }, 400);
  }
  let relId: number | null = null;
  if (type === "relation") {
    if (!relationEntityId && !relationEntitySlug) return c.json({ error: "Relation columns require relationEntityId or relationEntitySlug" }, 400);
    if (relationEntityId) {
      const [target] = await db.select().from(tables).where(eq(tables.id, relationEntityId));
      if (!target) return c.json({ error: "Relation target entity not found" }, 400);
      relId = target.id;
    } else if (relationEntitySlug) {
      const [target] = await db.select().from(tables).where(eq(tables.slug, relationEntitySlug));
      if (!target) return c.json({ error: "Relation target entity not found" }, 400);
      relId = target.id;
    }
    if (!relationFieldName) return c.json({ error: "Relation columns require relationFieldName (the key column)" }, 400);
  }
  if (relationFieldName && type === "relation" && relId !== null) {
    const targetFields = await db.select({ name: columns.name }).from(columns).where(eq(columns.entityId, relId));
    if (!targetFields.some((f) => f.name === relationFieldName)) {
      return c.json({ error: `Key column "${relationFieldName}" not found on the target table` }, 400);
    }
  }

  const orgSlug = resolved.orgSlug;
  try {
    await addFieldColumn(db, orgSlug, slug, name, type);
  } catch (e) {
    // Self-heal an orphaned column (crash between DDL and metadata insert).
    if (pgErrorMessage(e).includes("already exists")) {
      await dropColumnIfExists(db, orgSlug, slug, name);
      await addFieldColumn(db, orgSlug, slug, name, type);
    } else {
      throw e;
    }
  }
  try {
    const [field] = await db
      .insert(columns)
      .values({ entityId: resolved.entity.id, name, label, type, isRequired: is_required, relationEntityId: relId, relationFieldName: type === "relation" ? relationFieldName ?? null : null, inDetail: (parsed.data as any).in_detail ?? true })
      .returning();
    if (type === "select") await replaceOptions(field.id, (parsed.data.options as string[])!);
    return c.json({ ...field, options: (parsed.data.options as string[]) ?? [], relationEntityId: relId }, 201);
  } catch (err) {
    await dropColumnIfExists(db, orgSlug, slug, name).catch(() => {});
    throw err;
  }
});

app.patch("/entities/:orgSlug/:slug", async (c) => {
  const slug = c.req.param("slug");
  const resolved = await getEntityBySlug(db, c.req.param("orgSlug"), slug);
  if (!resolved) return c.json({ error: `Entity "${slug}" not found` }, 404);

  const parsed = updateEntityBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body", details: z.treeifyError(parsed.error) }, 400);
  const { slug: newSlug, label, viewRole, editRole } = parsed.data;
  if (newSlug === undefined && label === undefined && viewRole === undefined && editRole === undefined) {
    return c.json({ error: "Nothing to update" }, 400);
  }

  let currentSlug = slug;
  if (newSlug !== undefined && newSlug !== slug) {
    // Slug uniqueness is scoped to the owning org.
    const [taken] = await db
      .select({ id: entities.id })
      .from(tables)
      .where(and(eq(tables.orgId, resolved.entity.orgId), eq(tables.slug, newSlug)));
    if (taken) return c.json({ error: `Entity "${newSlug}" already exists in this organization` }, 409);
    await renameEntityTable(db, resolved.orgSlug, currentSlug, newSlug);
    currentSlug = newSlug;
  }
  try {
    const [updated] = await db
      .update(entities)
      .set({
        ...(newSlug !== undefined ? { slug: newSlug } : {}),
        ...(label !== undefined ? { label } : {}),
        ...(parsed.data.viewRole !== undefined ? { viewRole: parsed.data.viewRole } : {}),
        ...(parsed.data.editRole !== undefined ? { editRole: parsed.data.editRole } : {}),
      })
      .where(eq(tables.id, resolved.entity.id))
      .returning();
    return c.json(updated);
  } catch (err) {
    // Roll the table rename back so registry and Postgres stay in sync.
    if (newSlug !== undefined && newSlug !== slug) await renameEntityTable(db, resolved.orgSlug, currentSlug, slug).catch(() => {});
    throw err;
  }
});

app.patch("/entities/:orgSlug/:slug/columns/:name", async (c) => {
  const slug = c.req.param("slug");
  const fieldName = c.req.param("name");
  const resolved = await getEntityBySlug(db, c.req.param("orgSlug"), slug);
  if (!resolved) return c.json({ error: `Entity "${slug}" not found` }, 404);
  const field = resolved.columns.find((f) => f.name === fieldName);
  if (!field) return c.json({ error: `Field "${fieldName}" not found on "${slug}"` }, 404);

  const parsed = updateFieldBody.safeParse(await c.req.json());
  if (!parsed.success) return c.json({ error: "Invalid body", details: z.treeifyError(parsed.error) }, 400);
  const { name: newName, label, type, is_required, options, relationEntityId, relationEntitySlug } = parsed.data as any;
  const relationFieldName = (parsed.data as any).relationFieldName as string | undefined;
  const inDetail = (parsed.data as any).in_detail as boolean | undefined;
  if (newName === undefined && label === undefined && type === undefined && is_required === undefined && options === undefined && relationEntityId === undefined && relationEntitySlug === undefined && relationFieldName === undefined && inDetail === undefined) {
    return c.json({ error: "Nothing to update" }, 400);
  }
  if (options !== undefined && type !== "select" && (type ?? field.type) !== "select") {
    return c.json({ error: "Options are only valid on select columns" }, 400);
  }
  // Resolve relation target if provided
  let relId: number | null | undefined = undefined;
  if (relationEntityId !== undefined || relationEntitySlug !== undefined) {
    const finalType = type ?? field.type;
    if (finalType !== "relation") return c.json({ error: "relationEntityId only valid on relation columns" }, 400);
    if (relationEntityId) {
      const [target] = await db.select().from(tables).where(eq(tables.id, relationEntityId));
      if (!target) return c.json({ error: "Relation target not found" }, 400);
      relId = target.id;
    } else if (relationEntitySlug) {
      const [target] = await db.select().from(tables).where(eq(tables.slug, relationEntitySlug));
      if (!target) return c.json({ error: "Relation target not found" }, 400);
      relId = target.id;
    }
  }
  if (type === "relation" && relId === undefined && field.type !== "relation") {
    return c.json({ error: "Relation columns require relationEntityId or relationEntitySlug" }, 400);
  }
  const finalRelId = relId !== undefined ? relId : field.relationEntityId;
  const finalKey = relationFieldName !== undefined ? relationFieldName : field.relationFieldName ?? undefined;
  if ((type ?? field.type) === "relation") {
    if (!finalKey) return c.json({ error: "Relation columns require relationFieldName (the key column)" }, 400);
    if (finalRelId != null) {
      const targetFields = await db.select({ name: columns.name }).from(columns).where(eq(columns.entityId, finalRelId));
      if (!targetFields.some((f) => f.name === finalKey)) {
        return c.json({ error: `Key column "${finalKey}" not found on the target table` }, 400);
      }
    }
  }
  if (newName !== undefined && newName !== field.name) {
    if (newName === "id" || newName === "created_at") {
      return c.json({ error: `Field name "${newName}" is reserved` }, 409);
    }
    if (resolved.columns.some((f) => f.name === newName)) {
      return c.json({ error: `Field "${newName}" already exists on "${slug}"` }, 409);
    }
  }

  try {
    if (type !== undefined && type !== field.type) {
      await changeColumnType(db, resolved.orgSlug, slug, field.name, field.type as FieldType, type);
    }
    if (newName !== undefined && newName !== field.name) {
      await renameColumn(db, resolved.orgSlug, slug, field.name, newName);
    }
  } catch (err) {
    // Impossible casts etc. surface Postgres's message without registry changes.
    const detail = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Column change failed: ${detail}` }, 400);
  }

  const hasMetaChanges =
    newName !== undefined ||
    label !== undefined ||
    type !== undefined ||
    is_required !== undefined ||
    relId !== undefined ||
    relationFieldName !== undefined ||
    inDetail !== undefined;
  // If changing type to relation, ensure relId is set
  const effectiveRelId = relId !== undefined ? relId : (type !== undefined && type !== "relation" ? null : undefined);
  const [updated] = hasMetaChanges
    ? await db
        .update(columns)
        .set({
          ...(newName !== undefined ? { name: newName } : {}),
          ...(label !== undefined ? { label } : {}),
          ...(type !== undefined ? { type } : {}),
          ...(is_required !== undefined ? { isRequired: is_required } : {}),
          ...(inDetail !== undefined ? { inDetail } : {}),
          ...(effectiveRelId !== undefined ? { relationEntityId: effectiveRelId } : {}),
          ...(relationFieldName !== undefined ? { relationFieldName } : {}),
          ...(type !== undefined && type !== "relation" && field.type === "relation" ? { relationEntityId: null, relationFieldName: null } : {}),
          ...(type === "relation" && field.type !== "relation" ? { relationFieldName: relationFieldName ?? null } : {}),
        })
        .where(eq(columns.id, field.id))
        .returning()
    : [{ ...field }];

  const finalType = type ?? field.type;
  if (finalType === "select") {
    if (options !== undefined) await replaceOptions(field.id, options as string[]);
    const current = (await attachOptions([field.id])).get(field.id) ?? [];
    return c.json({ ...updated, options: current, relationEntityId: (updated as any).relationEntityId ?? null });
  }
  if (field.type === "select" && type !== undefined && type !== "select") {
    await db.delete(columnOptions).where(eq(columnOptions.fieldId, field.id));
  }
  // If we updated relation, ensure options are empty
  return c.json({ ...updated, options: [], relationEntityId: (updated as any).relationEntityId ?? relId ?? null });
});

app.delete("/entities/:orgSlug/:slug/columns/:name", async (c) => {
  const slug = c.req.param("slug");
  const fieldName = c.req.param("name");
  const resolved = await getEntityBySlug(db, c.req.param("orgSlug"), slug);
  if (!resolved) return c.json({ error: `Entity "${slug}" not found` }, 404);
  const field = resolved.columns.find((f) => f.name === fieldName);
  if (!field) return c.json({ error: `Field "${fieldName}" not found on "${slug}"` }, 404);

  // Connections elsewhere that use this column as their link/display key.
  const affected = await db
    .select({
      entityId: columns.entityId,
      entitySlug: entities.slug,
      entityLabel: entities.label,
      fieldName: columns.name,
      fieldLabel: columns.label,
    })
    .from(columns)
    .innerJoin(entities, eq(tables.id, columns.entityId))
    .where(and(eq(columns.relationEntityId, resolved.entity.id), eq(columns.relationFieldName, fieldName)));

  const reassignTo = c.req.query("reassignTo")?.trim();

  if (affected.length > 0) {
    // Explicit opt-out: reassign every dependent connection to the id column
    // (labels then degrade gracefully to "#id").
    if (reassignTo === "__id__") {
      await db
        .update(columns)
        .set({ relationFieldName: null })
        .where(and(eq(columns.relationEntityId, resolved.entity.id), eq(columns.relationFieldName, fieldName)));
    } else {
      if (!reassignTo) {
        return c.json(
          {
            error: `Column "${fieldName}" is the connection key for ${affected.length} connection(s); pick a replacement key or drop the connections`,
            affected,
          },
          409,
        );
      }
      const stillExists = resolved.columns.some((f) => f.name !== fieldName && f.name === reassignTo);
      if (!stillExists) {
        return c.json({ error: `Replacement key "${reassignTo}" is not a column of this table` }, 400);
      }
      await db
        .update(columns)
        .set({ relationFieldName: reassignTo })
        .where(and(eq(columns.relationEntityId, resolved.entity.id), eq(columns.relationFieldName, fieldName)));
    }
  }

  await dropColumnIfExists(db, resolved.orgSlug, slug, field.name);
  await db.delete(columns).where(eq(columns.id, field.id));
  return c.body(null, 204);
});

app.delete("/entities/:orgSlug/:slug", async (c) => {
  const slug = c.req.param("slug");
  const resolved = await getEntityBySlug(db, c.req.param("orgSlug"), slug);
  if (!resolved) return c.json({ error: `Entity "${slug}" not found` }, 404);

  const rowCount = await countRows(db, resolved.orgSlug, slug);
  if (rowCount > 0) {
    return c.json({ error: `Entity "${slug}" still has ${rowCount} row(s); delete them first` }, 409);
  }

  await dropEntityTable(db, resolved.orgSlug, slug);
  await db.delete(columns).where(eq(columns.entityId, resolved.entity.id));
  await db.delete(entities).where(eq(tables.id, resolved.entity.id));
  return c.body(null, 204);
});


// Legacy aliases for hierarchical (also handle /tables as alias to /entities for transition)
app.get("/tables", async (c) => {
  const { tables, organizations } = await import("../db/schema");
  const { eq } = await import("drizzle-orm");
  const { db } = await import("../db/connection");
  const orgs = await db.select().from(organizations);
  // Return all tables as entities for backwards compat
  const rows = await db.select().from(tables);
  return c.json(rows);
});
export default app;
