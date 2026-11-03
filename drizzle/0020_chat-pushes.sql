-- Chat pushes (#530): when each member last read their group's Chat, so a push skips someone watching it, and the message behind their last Chat push, so All messages pushes once per catch-up.
ALTER TABLE "memberships" ADD COLUMN "chat_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "memberships" ADD COLUMN "chat_pushed_id" integer;