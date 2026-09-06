CREATE TABLE "result_audits" (
	"id" serial PRIMARY KEY NOT NULL,
	"game_id" integer NOT NULL,
	"kind" text NOT NULL,
	"previous_value" text,
	"new_value" text,
	"note" text,
	"changed_by" integer NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "weeks" ADD COLUMN "scoreboard_fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "result_audits" ADD CONSTRAINT "result_audits_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_audits" ADD CONSTRAINT "result_audits_changed_by_members_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "result_audits_game_idx" ON "result_audits" USING btree ("game_id");