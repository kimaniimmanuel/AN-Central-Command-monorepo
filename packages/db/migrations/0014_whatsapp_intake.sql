-- WhatsApp Business Cloud API inbound message intake.
-- See packages/db/src/schema/whatsapp.ts.

CREATE TABLE IF NOT EXISTS "whatsapp_intake" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "wa_message_id" text NOT NULL,
  "from_number" text NOT NULL,
  "sender_name" text,
  "body" text,
  "msg_type" text DEFAULT 'text' NOT NULL,
  "received_at" timestamp with time zone NOT NULL,
  "processed" boolean DEFAULT false NOT NULL,
  "raw" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "whatsapp_intake_wa_message_id_unique" UNIQUE("wa_message_id")
);

CREATE INDEX IF NOT EXISTS "whatsapp_intake_from_idx" ON "whatsapp_intake" ("from_number");
CREATE INDEX IF NOT EXISTS "whatsapp_intake_received_idx" ON "whatsapp_intake" ("received_at");
CREATE INDEX IF NOT EXISTS "whatsapp_intake_processed_idx" ON "whatsapp_intake" ("processed");

-- Mirror the flames_crew/voters posture: no per-row RLS, app_user gets table grants.
GRANT SELECT, INSERT, UPDATE, DELETE ON "whatsapp_intake" TO app_user;
