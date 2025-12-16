ALTER TABLE "telehealth_invites" ADD COLUMN "patient_name" varchar(255);--> statement-breakpoint
ALTER TABLE "telehealth_invites" ADD COLUMN "scheduled_for" timestamp;--> statement-breakpoint
ALTER TABLE "telehealth_invites" ADD COLUMN "minutes_before" integer;