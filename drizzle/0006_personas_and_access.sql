ALTER TYPE "public"."user_role" ADD VALUE 'developer' BEFORE 'member';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'editor' BEFORE 'member';--> statement-breakpoint
ALTER TYPE "public"."user_role" ADD VALUE 'viewer' BEFORE 'member';--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "view_role" text DEFAULT 'viewer' NOT NULL;--> statement-breakpoint
ALTER TABLE "entities" ADD COLUMN "edit_role" text DEFAULT 'editor' NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "default_view_role" text DEFAULT 'viewer' NOT NULL;--> statement-breakpoint
ALTER TABLE "orgs" ADD COLUMN "default_edit_role" text DEFAULT 'editor' NOT NULL;