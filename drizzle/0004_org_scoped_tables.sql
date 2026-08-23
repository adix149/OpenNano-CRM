ALTER TABLE "entities" DROP CONSTRAINT "entities_project_id_projects_id_fk";
--> statement-breakpoint
DROP INDEX "entities_slug_unique";--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "org_id" integer;--> statement-breakpoint
UPDATE "entities" SET "org_id" = (SELECT p."org_id" FROM "projects" p WHERE p."id" = "entities"."project_id") WHERE "org_id" IS NULL;--> statement-breakpoint
DELETE FROM "entities" WHERE "org_id" IS NULL;--> statement-breakpoint
ALTER TABLE "entities" ALTER COLUMN "org_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_org_id_orgs_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."orgs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entities" ADD CONSTRAINT "entities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entities_org_id_slug_idx" ON "entities" USING btree ("org_id","slug");