CREATE TABLE "game_stats" (
	"game_id" integer PRIMARY KEY NOT NULL,
	"box_score" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "season_rosters" (
	"season_id" integer PRIMARY KEY NOT NULL,
	"positions" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weeks" ADD COLUMN IF NOT EXISTS "stats_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "game_stats" ADD CONSTRAINT "game_stats_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "season_rosters" ADD CONSTRAINT "season_rosters_season_id_seasons_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."seasons"("id") ON DELETE no action ON UPDATE no action;