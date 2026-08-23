CREATE TYPE "public"."user_role" AS ENUM('admin', 'member');--> statement-breakpoint
ALTER TYPE "public"."field_type" ADD VALUE 'relation';--> statement-breakpoint
CREATE TABLE "orgs" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orgs_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"org_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"username" text NOT NULL,
	"display_name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" DEFAULT 'member' NOT NULL,
	"org_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
ALTER TABLE "entities" DROP CONSTRAINT "entities_slug_unique";--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "project_id" integer;--> statement-breakpoint
ALTER TABLE "fields" ADD COLUMN "relation_entity_id" integer;--> statement-breakpoint
INSERT INTO "orgs" ("slug", "name", "description") VALUES ('default', 'Default Organization', 'Auto-created default org') ON CONFLICT ("slug") DO NOTHING;--> statement-breakpoint
INSERT INTO "projects" ("slug", "name", "description", "org_id") SELECT 'default', 'Default Project', 'Auto-created default project', "id" FROM "orgs" WHERE "slug"='default' ON CONFLICT DO NOTHING;--> statement-breakpoint
UPDATE "entities" SET "project_id" = (SELECT "id" FROM "projects" WHERE "slug"='default' LIMIT 1) WHERE "project_id" IS NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_org_id_slug_idx" ON "projects" USING btree ("org_id","slug");--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fields" ADD CONSTRAINT "fields_relation_entity_id_entities_id_fk" FOREIGN KEY ("relation_entity_id") REFERENCES "public"."entities"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entities_project_id_slug_idx" ON "entities" USING btree ("project_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "entities_slug_unique" ON "entities" USING btree ("slug");