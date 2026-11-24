CREATE TABLE "champion_sheet_views" (
	"member_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	"season_id" integer NOT NULL,
	"as_champion" boolean NOT NULL,
	"seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "champion_sheet_views_member_id_group_id_season_id_pk" PRIMARY KEY("member_id","group_id","season_id")
);
--> statement-breakpoint
ALTER TABLE "champion_sheet_views" ADD CONSTRAINT "champion_sheet_views_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "champion_sheet_views" ADD CONSTRAINT "champion_sheet_views_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "champion_sheet_views" ADD CONSTRAINT "champion_sheet_views_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;