ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "possession" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "last_play" text;--> statement-breakpoint
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "situation" text;
