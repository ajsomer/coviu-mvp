CREATE TYPE "public"."pms_appointment_status" AS ENUM('booked', 'confirmed', 'arrived', 'in_progress', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."pms_sync_status" AS ENUM('success', 'partial', 'failed', 'running');--> statement-breakpoint
CREATE TYPE "public"."pms_sync_type" AS ENUM('full', 'incremental', 'manual');--> statement-breakpoint
CREATE TYPE "public"."pms_type" AS ENUM('gentu', 'medirecords', 'halaxy');--> statement-breakpoint
CREATE TABLE "pms_appointment_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pms_connection_id" uuid NOT NULL,
	"pms_type_id" varchar(255) NOT NULL,
	"pms_type_name" varchar(255) NOT NULL,
	"default_duration_minutes" integer,
	"colour" varchar(20),
	"is_telehealth" boolean DEFAULT false NOT NULL,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pms_clinician_mappings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pms_connection_id" uuid NOT NULL,
	"pms_practitioner_id" varchar(255) NOT NULL,
	"pms_practitioner_name" varchar(255),
	"run_sheet_clinician_id" uuid,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"auto_created" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pms_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pms_type" "pms_type" NOT NULL,
	"display_name" varchar(255) NOT NULL,
	"tenant_id" varchar(255),
	"practice_id" varchar(255),
	"organization_id" varchar(255),
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"sync_enabled" boolean DEFAULT true NOT NULL,
	"sync_frequency_minutes" integer DEFAULT 15 NOT NULL,
	"last_sync_at" timestamp with time zone,
	"last_sync_status" "pms_sync_status",
	"last_sync_error" text,
	"sync_telehealth_only" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pms_sync_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pms_connection_id" uuid NOT NULL,
	"sync_type" "pms_sync_type" NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"status" "pms_sync_status" NOT NULL,
	"appointments_fetched" integer DEFAULT 0 NOT NULL,
	"appointments_created" integer DEFAULT 0 NOT NULL,
	"appointments_updated" integer DEFAULT 0 NOT NULL,
	"appointments_skipped" integer DEFAULT 0 NOT NULL,
	"error_message" text,
	"error_details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "run_sheet_appointments" ADD COLUMN "pms_connection_id" uuid;--> statement-breakpoint
ALTER TABLE "run_sheet_appointments" ADD COLUMN "pms_appointment_id" varchar(255);--> statement-breakpoint
ALTER TABLE "run_sheet_appointments" ADD COLUMN "pms_last_synced_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "run_sheet_appointments" ADD COLUMN "is_telehealth" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "run_sheet_appointments" ADD COLUMN "appointment_status" "pms_appointment_status";--> statement-breakpoint
ALTER TABLE "run_sheet_appointments" ADD COLUMN "appointment_duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "run_sheet_appointments" ADD COLUMN "patient_dob" date;--> statement-breakpoint
ALTER TABLE "run_sheet_appointments" ADD COLUMN "patient_email" varchar(255);--> statement-breakpoint
ALTER TABLE "pms_appointment_types" ADD CONSTRAINT "pms_appointment_types_pms_connection_id_pms_connections_id_fk" FOREIGN KEY ("pms_connection_id") REFERENCES "public"."pms_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pms_clinician_mappings" ADD CONSTRAINT "pms_clinician_mappings_pms_connection_id_pms_connections_id_fk" FOREIGN KEY ("pms_connection_id") REFERENCES "public"."pms_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pms_clinician_mappings" ADD CONSTRAINT "pms_clinician_mappings_run_sheet_clinician_id_run_sheet_clinicians_id_fk" FOREIGN KEY ("run_sheet_clinician_id") REFERENCES "public"."run_sheet_clinicians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pms_sync_log" ADD CONSTRAINT "pms_sync_log_pms_connection_id_pms_connections_id_fk" FOREIGN KEY ("pms_connection_id") REFERENCES "public"."pms_connections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pms_appointment_types_connection_type_idx" ON "pms_appointment_types" USING btree ("pms_connection_id","pms_type_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pms_clinician_mappings_connection_practitioner_idx" ON "pms_clinician_mappings" USING btree ("pms_connection_id","pms_practitioner_id");--> statement-breakpoint
ALTER TABLE "run_sheet_appointments" ADD CONSTRAINT "run_sheet_appointments_pms_connection_id_pms_connections_id_fk" FOREIGN KEY ("pms_connection_id") REFERENCES "public"."pms_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "run_sheet_appointments_pms_unique_idx" ON "run_sheet_appointments" USING btree ("pms_connection_id","pms_appointment_id");