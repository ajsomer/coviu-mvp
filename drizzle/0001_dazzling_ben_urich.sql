CREATE TYPE "public"."form_request_status" AS ENUM('pending', 'completed', 'expired');--> statement-breakpoint
CREATE TYPE "public"."run_sheet_status" AS ENUM('draft', 'reviewing', 'confirmed');--> statement-breakpoint
CREATE TABLE "form_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"appointment_request_id" uuid NOT NULL,
	"form_template_id" uuid NOT NULL,
	"token" varchar(64) NOT NULL,
	"status" "form_request_status" DEFAULT 'pending' NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"expires_at" timestamp,
	CONSTRAINT "form_requests_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "form_submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"form_request_id" uuid NOT NULL,
	"data" jsonb NOT NULL,
	"stripe_payment_intent_id" varchar(255),
	"submitted_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "form_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"schema" jsonb NOT NULL,
	"specialist_id" uuid,
	"is_default" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_sheet_appointments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_sheet_id" uuid NOT NULL,
	"screenshot_id" uuid,
	"clinician_id" uuid,
	"patient_name" varchar(255),
	"patient_phone" varchar(50),
	"appointment_time" varchar(20),
	"appointment_type" varchar(255),
	"confidence" real,
	"is_manual_entry" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_sheet_clinicians" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_sheet_screenshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_sheet_id" uuid NOT NULL,
	"original_url" text NOT NULL,
	"cropped_url" text,
	"uploaded_at" timestamp DEFAULT now() NOT NULL,
	"processed_at" timestamp,
	"ocr_raw_response" jsonb
);
--> statement-breakpoint
CREATE TABLE "run_sheets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"date" date NOT NULL,
	"status" "run_sheet_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "form_requests" ADD CONSTRAINT "form_requests_appointment_request_id_appointment_requests_id_fk" FOREIGN KEY ("appointment_request_id") REFERENCES "public"."appointment_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_requests" ADD CONSTRAINT "form_requests_form_template_id_form_templates_id_fk" FOREIGN KEY ("form_template_id") REFERENCES "public"."form_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_submissions" ADD CONSTRAINT "form_submissions_form_request_id_form_requests_id_fk" FOREIGN KEY ("form_request_id") REFERENCES "public"."form_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "form_templates" ADD CONSTRAINT "form_templates_specialist_id_specialists_id_fk" FOREIGN KEY ("specialist_id") REFERENCES "public"."specialists"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_sheet_appointments" ADD CONSTRAINT "run_sheet_appointments_run_sheet_id_run_sheets_id_fk" FOREIGN KEY ("run_sheet_id") REFERENCES "public"."run_sheets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_sheet_appointments" ADD CONSTRAINT "run_sheet_appointments_screenshot_id_run_sheet_screenshots_id_fk" FOREIGN KEY ("screenshot_id") REFERENCES "public"."run_sheet_screenshots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_sheet_appointments" ADD CONSTRAINT "run_sheet_appointments_clinician_id_run_sheet_clinicians_id_fk" FOREIGN KEY ("clinician_id") REFERENCES "public"."run_sheet_clinicians"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_sheet_screenshots" ADD CONSTRAINT "run_sheet_screenshots_run_sheet_id_run_sheets_id_fk" FOREIGN KEY ("run_sheet_id") REFERENCES "public"."run_sheets"("id") ON DELETE no action ON UPDATE no action;