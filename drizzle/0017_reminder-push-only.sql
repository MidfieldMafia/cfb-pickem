-- The Pick reminder goes by push or not at all (#475). Nothing writes 'text', so this only catches a row edited by hand.
UPDATE "members" SET "reminder_channel" = 'off' WHERE "reminder_channel" = 'text';
