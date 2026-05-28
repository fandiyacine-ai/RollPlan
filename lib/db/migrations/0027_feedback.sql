CREATE TABLE IF NOT EXISTS "feedback" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "rating" integer,
  "category" text,
  "message" text,
  "page" text,
  "created_at" timestamp NOT NULL DEFAULT now()
);
