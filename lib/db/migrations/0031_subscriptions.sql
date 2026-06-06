CREATE TABLE IF NOT EXISTS "subscriptions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "stripe_customer_id" text NOT NULL,
  "stripe_subscription_id" text,
  "stripe_price_id" text,
  "status" text NOT NULL DEFAULT 'free',
  "trial_ends_at" timestamp,
  "current_period_end" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_user_id_idx" ON "subscriptions" ("user_id");
CREATE UNIQUE INDEX IF NOT EXISTS "subscriptions_stripe_customer_id_idx" ON "subscriptions" ("stripe_customer_id");
