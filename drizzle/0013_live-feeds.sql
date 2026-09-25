CREATE TABLE "live_feeds" (
	"game_id" integer PRIMARY KEY NOT NULL,
	"drives" jsonb NOT NULL,
	"fetched_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "live_feed" jsonb;--> statement-breakpoint
ALTER TABLE "live_feeds" ADD CONSTRAINT "live_feeds_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;