import { sql } from 'drizzle-orm';
import { boolean, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// WhatsApp Business Cloud API inbound intake.
//
// Every message a member/contact sends to the campaign number arrives here via the
// webhook (apps/web/app/api/whatsapp/webhook). This is the INPUT side of the
// legitimate WhatsApp integration — members reporting what's happening in their
// groups — NOT a mirror of group chats (which the official API cannot provide).
//
// `wa_message_id` is unique so Meta's webhook retries are idempotent (ON CONFLICT
// DO NOTHING). `raw` keeps the full payload for audit/replay. `processed` flags
// rows once they've been rolled into a daily report.
//
// Posture mirrors flames_crew/voters: no per-row RLS, app_user gets table grants
// (the webhook inserts as the app; privileged pages read via withRlsTx).

export const whatsappIntake = pgTable(
  'whatsapp_intake',
  {
    id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
    waMessageId: text('wa_message_id').notNull().unique(),
    fromNumber: text('from_number').notNull(),
    senderName: text('sender_name'),
    body: text('body'),
    msgType: text('msg_type').notNull().default('text'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull(),
    processed: boolean('processed').notNull().default(false),
    raw: jsonb('raw'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`now()`),
  },
  (t) => ({
    fromIdx: index('whatsapp_intake_from_idx').on(t.fromNumber),
    receivedIdx: index('whatsapp_intake_received_idx').on(t.receivedAt),
    processedIdx: index('whatsapp_intake_processed_idx').on(t.processed),
  }),
);

export type WhatsAppIntake = typeof whatsappIntake.$inferSelect;
export type NewWhatsAppIntake = typeof whatsappIntake.$inferInsert;
