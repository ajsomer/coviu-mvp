CREATE TYPE "public"."telehealth_invite_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "telehealth_invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_sheet_appointment_id" uuid,
	"phone_number" varchar(50) NOT NULL,
	"clinician_id" uuid,
	"appointment_date" date NOT NULL,
	"appointment_time" varchar(20) NOT NULL,
	"status" "telehealth_invite_status" DEFAULT 'queued' NOT NULL,
	"queued_at" timestamp DEFAULT now() NOT NULL,
	"sent_at" timestamp,
	"failed_at" timestamp,
	"failure_reason" text
);
--> statement-breakpoint
ALTER TABLE "telehealth_invites" ADD CONSTRAINT "telehealth_invites_run_sheet_appointment_id_run_sheet_appointments_id_fk" FOREIGN KEY ("run_sheet_appointment_id") REFERENCES "public"."run_sheet_appointments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "telehealth_invites" ADD CONSTRAINT "telehealth_invites_clinician_id_run_sheet_clinicians_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."run_sheet_clinicians"("id") ON DELETE no action ON UPDATE no action;