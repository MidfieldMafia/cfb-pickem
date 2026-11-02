-- Chat @mentions (#525): who a message mentions, for the pushes, and headroom on the stored text, since a mention token can be longer than the name it shows. The 280 limit stays in code, on the rendered text.
CREATE TABLE "chat_mentions" (
	"message_id" integer NOT NULL,
	"member_id" integer NOT NULL,
	CONSTRAINT "chat_mentions_message_id_member_id_pk" PRIMARY KEY("message_id","member_id")
);
--> statement-breakpoint
ALTER TABLE "chat_messages" DROP CONSTRAINT "chat_messages_text_length";--> statement-breakpoint
ALTER TABLE "chat_mentions" ADD CONSTRAINT "chat_mentions_message_id_chat_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."chat_messages"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_mentions" ADD CONSTRAINT "chat_mentions_member_id_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."members"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_mentions_member_idx" ON "chat_mentions" USING btree ("member_id");--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_text_length" CHECK (char_length("chat_messages"."text") between 1 and 1000);