-- Notifications (#529): one setting per push kind per member, and a table that reserves each push before it is sent. Adding notify_reminder with its default turns the Pick reminder on for every existing member (#494); nothing reaches a member with no device.
CREATE TABLE "push_reservations" (
	"key" text PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "notify_reminder" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "notify_chat" text DEFAULT 'mentions' NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "notify_weekly_win" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "notify_close_games" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "members" ADD COLUMN "notify_feedback" boolean DEFAULT true NOT NULL;