/**
 * OpenNano-CRM — Database Schema
 *
 * Strict hierarchy (enforced by foreign keys):
 *
 *   Organization ─┬─► Project ─┬─► Entity (Table)
 *                 │             │      └─► Field (Column) ─► FieldOption
 *                 │             └─► Entity (org-wide, project_id = NULL)
 *                 └─► User
 *                      └─► Entity (physical table lives in org's Postgres schema)
 *
 * Physical storage:
 *   Each organization owns one Postgres schema named after its slug.
 *   All dynamic tables live as `<org_slug>.<entity_slug>`.
 *   Backup/restore per org = dump one schema. Delete org = drop schema.
 */

import { pgEnum, pgTable, serial, text, timestamp, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";

// ─────────────────────────────────────────────────────────────────────────────
// Organizations — top-level tenant
// ─────────────────────────────────────────────────────────────────────────────

export const organizations = pgTable("organizations", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  iconUrl: text("icon_url"),
  defaultViewRole: text("default_view_role").notNull().default("viewer"),
  defaultEditRole: text("default_edit_role").notNull().default("editor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Backwards compat alias — old code imports `orgs`
export const orgs = organizations;

// ─────────────────────────────────────────────────────────────────────────────
// Projects — container within an organization
// ─────────────────────────────────────────────────────────────────────────────

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    orgId: integer("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("projects_org_id_slug_idx").on(t.orgId, t.slug)],
);

// ─────────────────────────────────────────────────────────────────────────────
// Personas — ranked: viewer < editor < developer < admin
// ─────────────────────────────────────────────────────────────────────────────

export const userRole = pgEnum("user_role", ["admin", "developer", "editor", "viewer", "member"]);

// ─────────────────────────────────────────────────────────────────────────────
// Users — bound to an organization, authenticated via JWT
// ─────────────────────────────────────────────────────────────────────────────

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("viewer"),
  orgId: integer("org_id").references(() => organizations.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ─────────────────────────────────────────────────────────────────────────────
// Entities — dynamic tables (physical: <org_slug>.<entity_slug>)
// ─────────────────────────────────────────────────────────────────────────────

export const fieldType = pgEnum("field_type", [
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
]);

export const entities = pgTable(
  "entities",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    icon: text("icon"),
    /** Owning org — determines physical Postgres schema. */
    orgId: integer("org_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    /** NULL = organization-wide; set = scoped to a project. */
    projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
    viewRole: text("view_role").notNull().default("viewer"),
    editRole: text("edit_role").notNull().default("editor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("entities_org_id_slug_idx").on(t.orgId, t.slug)],
);

// ─────────────────────────────────────────────────────────────────────────────
// Fields — columns within an entity
// ─────────────────────────────────────────────────────────────────────────────

export const fields = pgTable(
  "fields",
  {
    id: serial("id").primaryKey(),
    entityId: integer("entity_id")
      .notNull()
      .references(() => entities.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    label: text("label").notNull(),
    type: fieldType("type").notNull(),
    isRequired: boolean("is_required").notNull().default(false),
    inDetail: boolean("in_detail").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    /** For relation fields: target entity + display column. */
    relationEntityId: integer("relation_entity_id").references(() => entities.id, { onDelete: "set null" }),
    relationFieldName: text("relation_field_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fields_entity_id_name_idx").on(t.entityId, t.name)],
);

// ─────────────────────────────────────────────────────────────────────────────
// Field options — allowed values for `select` fields
// ─────────────────────────────────────────────────────────────────────────────

export const fieldOptions = pgTable(
  "field_options",
  {
    id: serial("id").primaryKey(),
    fieldId: integer("field_id")
      .notNull()
      .references(() => fields.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("field_options_field_id_value_idx").on(t.fieldId, t.value)],
);
