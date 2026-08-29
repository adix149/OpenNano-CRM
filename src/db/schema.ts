/**
 * OpenNano-CRM — Database Schema (v0.1 clean)
 *
 * Hierarchy: Organization → Project → Table → Column → Record
 * Physical:  <organization_slug>.<table_slug> (one Postgres schema per org)
 */

import { pgEnum, pgTable, serial, text, timestamp, boolean, integer, jsonb, uniqueIndex } from "drizzle-orm/pg-core";

// ── Personas ─────────────────────────────────────────────────────────────────
export const userRole = pgEnum("user_role", ["admin", "developer", "editor", "viewer"]);
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
export const viewKind = pgEnum("view_kind", ["form", "page", "pdf", "calendar", "kanban", "table"]);

// ── Organizations ────────────────────────────────────────────────────────────
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

// ── Projects ─────────────────────────────────────────────────────────────────
export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    orgId: integer("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("projects_org_id_slug_idx").on(t.orgId, t.slug)],
);

// ── Users ────────────────────────────────────────────────────────────────────
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("viewer"),
  orgId: integer("organization_id").references(() => organizations.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Tables (dynamic table definitions) ───────────────────────────────────────
export const tables = pgTable(
  "tables",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    description: text("description"),
    icon: text("icon"),
    orgId: integer("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
    viewRole: text("view_role").notNull().default("viewer"),
    editRole: text("edit_role").notNull().default("editor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("tables_org_id_slug_idx").on(t.orgId, t.slug)],
);

// ── Columns ──────────────────────────────────────────────────────────────────
export const columns = pgTable(
  "columns",
  {
    id: serial("id").primaryKey(),
    entityId: integer("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    label: text("label").notNull(),
    type: fieldType("type").notNull(),
    isRequired: boolean("is_required").notNull().default(false),
    inDetail: boolean("in_detail").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    relationEntityId: integer("relation_table_id").references(() => tables.id, { onDelete: "set null" }),
    relationFieldName: text("relation_field_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("columns_table_id_name_idx").on(t.entityId, t.name)],
);

// ── Column options (for select) ──────────────────────────────────────────────
export const columnOptions = pgTable(
  "column_options",
  {
    id: serial("id").primaryKey(),
    fieldId: integer("column_id")
      .notNull()
      .references(() => columns.id, { onDelete: "cascade" }),
    value: text("value").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("column_options_column_id_value_idx").on(t.fieldId, t.value)],
);

// ── Views ────────────────────────────────────────────────────────────────────
export const views = pgTable(
  "views",
  {
    id: serial("id").primaryKey(),
    organizationId: integer("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    tableId: integer("table_id")
      .notNull()
      .references(() => tables.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    label: text("label").notNull(),
    kind: viewKind("kind").notNull().default("form"),
    layout: jsonb("layout").notNull(),
    config: jsonb("config"),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("views_table_id_slug_idx").on(t.tableId, t.slug)],
);

// ── Activities ───────────────────────────────────────────────────────────────
export const activities = pgTable("activities", {
  id: serial("id").primaryKey(),
  organizationId: integer("organization_id")
    .notNull()
    .references(() => organizations.id, { onDelete: "cascade" }),
  tableId: integer("table_id")
    .notNull()
    .references(() => tables.id, { onDelete: "cascade" }),
  recordId: integer("record_id").notNull(),
  type: text("type").notNull(),
  body: text("body"),
  actorId: integer("actor_id").references(() => users.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Back-compat aliases (remove after migration) ─────────────────────────────
export const entities = tables;
export const fields = columns;
export const fieldOptions = columnOptions;
export const orgs = organizations;
