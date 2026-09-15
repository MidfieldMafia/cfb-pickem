CREATE TABLE "groups" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"join_token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "groups_join_token_unique" UNIQUE("join_token")
);
--> statement-breakpoint
CREATE TABLE "membership_removals" (
	"id" serial PRIMARY KEY NOT NULL,
	"group_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"removed_at" timestamp with time zone NOT NULL,
	"restored_at" timestamp with time zone,
	CONSTRAINT "membership_removals_restored_after_removed" CHECK ("membership_removals"."restored_at" is null or "membership_removals"."restored_at" > "membership_removals"."removed_at")
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"group_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_group_id_member_id_pk" PRIMARY KEY("group_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "membership_removals" ADD CONSTRAINT "membership_removals_group_id_member_id_memberships_group_id_member_id_fk" FOREIGN KEY ("group_id","member_id") REFERENCES "public"."memberships"("group_id","member_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "membership_removals_open_idx" ON "membership_removals" USING btree ("group_id","member_id") WHERE "membership_removals"."restored_at" is null;--> statement-breakpoint
CREATE INDEX "memberships_member_idx" ON "memberships" USING btree ("member_id");--> statement-breakpoint
ALTER TABLE "members" ADD CONSTRAINT "members_phone_unique" UNIQUE("phone");--> statement-breakpoint
-- Hand-written below: moves the family into Mabry Family. It only adds rows and never touches a Pick.
-- The Join Link token is two random UUIDs without dashes (gen_random_uuid is built in from Postgres 13), and the
-- group's Manage screen can reset it.
INSERT INTO "groups" ("name", "join_token")
VALUES ('Mabry Family', replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''));--> statement-breakpoint
-- Every member, deactivated included, from the day they joined. The commissioners, Jonah and Alex, organize it.
INSERT INTO "memberships" ("group_id", "member_id", "role", "joined_at")
SELECT "groups"."id", "members"."id", CASE WHEN "members"."is_commissioner" THEN 'organizer' ELSE 'member' END, "members"."joined_at"
FROM "members" CROSS JOIN "groups"
WHERE "groups"."name" = 'Mabry Family';