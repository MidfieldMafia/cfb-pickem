CREATE TABLE "tour_dismissals" (
	"member_id" integer NOT NULL,
	"tour_id" text NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tour_dismissals_member_id_tour_id_pk" PRIMARY KEY("member_id","tour_id")
);
--> statement-breakpoint
ALTER TABLE "tour_dismissals" ADD CONSTRAINT "tour_dismissals_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Every member already welcomed has seen the app, so none of them gets the Welcome Tour (#384).
INSERT INTO "tour_dismissals" ("member_id", "tour_id") SELECT "id", 'welcome' FROM "members" WHERE "welcomed_at" IS NOT NULL;
