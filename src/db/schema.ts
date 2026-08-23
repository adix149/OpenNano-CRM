import { pgEnum, pgTable, serial, text, timestamp, boolean, integer, uniqueIndex } from "drizzle-orm/pg-core";

/**
 * Nomenclature (hierarchy):
 * Organization → Project → Entity (Table/Collection) → Field (Column) → Record (Row)
 * - Organization: top-level tenant (e.g. "Acme Corp"), owns projects & users
 * - Project: container within an org (e.g. "Sales CRM"), owns entities
 * - Entity: dynamic table definition, auto-creates a real Postgres table + form
 * - Field: column definition within an entity
 * - Record: row instance in an entity's table
 * - Relation (Connection Key): a field that references another entity's records
 */

// ── Hierarchy ──

export const orgs = pgTable("orgs", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  description: text("description"),
  /** Default access personas applied to new tables in this org. */
  defaultViewRole: text("default_view_role").notNull().default("viewer"),
  defaultEditRole: text("default_edit_role").notNull().default("editor"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const projects = pgTable(
  "projects",
  {
    id: serial("id").primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    orgId: integer("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("projects_org_id_slug_idx").on(t.orgId, t.slug)],
);

// ── Users & Auth (local, extensible to OAuth later) ──

/**
 * Personas (ranked): viewer < editor < developer < admin.
 * - viewer: read records only
 * - editor: create/edit/delete records
 * - developer: build tables/fields (Dev Studio) + org/table access settings
 * - admin: everything, incl. user management
 * "member" is a legacy alias of viewer.
 */
export const userRole = pgEnum("user_role", ["admin", "developer", "editor", "viewer", "member"]);

export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  displayName: text("display_name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: userRole("role").notNull().default("member"),
  orgId: integer("org_id").references(() => orgs.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Dynamic entities ──

/**
 * Field types supported.
 * - relation: stores INTEGER FK to another entity's record (connection key)
 */
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
    /**
     * Every table belongs to exactly one org; its physical Postgres table
     * lives inside that org's schema (`<org_slug>.<entity_slug>`).
     */
    orgId: integer("org_id")
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    /** NULL = organization-wide scope; set = nested under a project. */
    projectId: integer("project_id").references(() => projects.id, { onDelete: "set null" }),
    /** Minimum persona required to view / edit records of this table. */
    viewRole: text("view_role").notNull().default("viewer"),
    editRole: text("edit_role").notNull().default("editor"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("entities_project_id_slug_idx").on(t.projectId, t.slug), uniqueIndex("entities_org_id_slug_idx").on(t.orgId, t.slug)],
);

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
    sortOrder: integer("sort_order").notNull().default(0),
    // For relation (connection key) fields: which entity they reference
    relationEntityId: integer("relation_entity_id").references(() => entities.id, { onDelete: "set null" }),
    /** Which column of the target table is used as the linking/display key. */
    relationFieldName: text("relation_field_name"),
    /** Whether this field appears on the record detail page. */
    inDetail: boolean("in_detail").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("fields_entity_id_name_idx").on(t.entityId, t.name)],
);

/** Predetermined values for `select` fields; stored per field, order matters. */
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
