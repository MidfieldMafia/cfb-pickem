CREATE TABLE "push_game_events" (
	"game_id" integer NOT NULL,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_game_events_game_id_kind_pk" PRIMARY KEY("game_id","kind")
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"member_id" integer NOT NULL,
	"endpoint" text NOT NULL,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"chat" boolean DEFAULT true NOT NULL,
	"finals" boolean DEFAULT true NOT NULL,
	"feedback" boolean DEFAULT true NOT NULL,
	"review" boolean DEFAULT true NOT NULL,
	"roll_call" boolean DEFAULT true NOT NULL,
	"close" boolean DEFAULT true NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_sent_at" timestamp with time zone,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "push_game_events" ADD CONSTRAINT "push_game_events_game_id_games_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."games"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "push_subscriptions_member_idx" ON "push_subscriptions" USING btree ("member_id");