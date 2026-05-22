CREATE TABLE "technique_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" text NOT NULL,
	"position_id" text,
	"name" text NOT NULL,
	"format" text DEFAULT 'both' NOT NULL,
	"visual_cues" text NOT NULL,
	"counters" text,
	"reference_image_url" text,
	"source_url" text,
	"source_label" text,
	"extracted_by_model" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"admin_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
