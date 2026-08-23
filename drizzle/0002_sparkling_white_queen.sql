ALTER TYPE "public"."field_type" ADD VALUE 'decimal' BEFORE 'boolean';--> statement-breakpoint
ALTER TYPE "public"."field_type" ADD VALUE 'email';--> statement-breakpoint
ALTER TYPE "public"."field_type" ADD VALUE 'phone';--> statement-breakpoint
ALTER TYPE "public"."field_type" ADD VALUE 'url';--> statement-breakpoint
ALTER TYPE "public"."field_type" ADD VALUE 'location';--> statement-breakpoint
ALTER TYPE "public"."field_type" ADD VALUE 'select';--> statement-breakpoint
CREATE TABLE "field_options" (
	"id" serial PRIMARY KEY NOT NULL,
	"field_id" integer NOT NULL,
	"value" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "field_options" ADD CONSTRAINT "field_options_field_id_fields_id_fk" FOREIGN KEY ("field_id") REFERENCES "public"."fields"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "field_options_field_id_value_idx" ON "field_options" USING btree ("field_id","value");