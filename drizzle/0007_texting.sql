CREATE TABLE "text_messages" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"kind" text NOT NULL,
	"week_id" integer,
	"phone" text NOT NULL,
	"provider" text NOT NULL,
	"status" text NOT NULL,
	"detail" text,
	"segments" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "sms_opted_out" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "text_messages" ADD CONSTRAINT "text_messages_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "text_messages" ADD CONSTRAINT "text_messages_week_id_weeks_id_fk" FOREIGN KEY ("week_id") REFERENCES "public"."weeks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "text_messages_created_idx" ON "text_messages" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "text_messages_week_kind_idx" ON "text_messages" USING btree ("week_id","kind");