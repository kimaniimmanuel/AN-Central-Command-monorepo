import { NextRequest, NextResponse } from 'next/server';
import { db, whatsappIntake } from '@an/db';
import {
  getWhatsAppConfig,
  verifyWebhookSignature,
  parseInboundMessages,
} from '@/lib/whatsapp';

export const runtime = 'nodejs';
// Never cache — every webhook delivery is unique.
export const dynamic = 'force-dynamic';

// Webhook for the WhatsApp Business Cloud API.
//
//   GET  → Meta's one-time verification handshake when you save the webhook URL.
//   POST → inbound events (messages members send to the campaign number, plus
//          status callbacks which we ignore).
//
// Public URL to register in Meta: https://<your-deployed-host>/api/whatsapp/webhook
// (localhost won't receive Meta webhooks — use the Railway/Dokploy URL).
//
// Inbound messages are signature-verified, parsed, and persisted to whatsapp_intake
// (idempotent on wa_message_id — Meta retries won't duplicate). They then surface
// in Data Reports → Inbox. Meta requires a fast 200, so a storage hiccup still
// ACKs (the message is logged) rather than triggering a retry storm.

export async function GET(req: NextRequest) {
  const cfg = getWhatsAppConfig();
  const params = req.nextUrl.searchParams;
  const mode = params.get('hub.mode');
  const token = params.get('hub.verify_token');
  const challenge = params.get('hub.challenge');

  // Handshake: echo the challenge back ONLY when the verify token matches ours.
  if (mode === 'subscribe' && cfg && token === cfg.verifyToken && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } });
  }
  return new NextResponse('Forbidden', { status: 403 });
}

export async function POST(req: NextRequest) {
  const cfg = getWhatsAppConfig();
  // If not configured, accept + ignore so Meta doesn't retry-storm during setup.
  if (!cfg) return NextResponse.json({ ok: true, note: 'whatsapp not configured' });

  // Signature check MUST run on the raw body.
  const raw = await req.text();
  const signature = req.headers.get('x-hub-signature-256');
  if (!verifyWebhookSignature(raw, signature, cfg.appSecret)) {
    return new NextResponse('Invalid signature', { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ ok: true }); // ack malformed to avoid retries
  }

  const messages = parseInboundMessages(payload);
  let stored = 0;
  for (const m of messages) {
    if (!m.messageId || !m.from) continue;
    try {
      // Meta timestamps are unix seconds; guard against a missing/garbage value.
      const secs = Number(m.timestamp);
      const receivedAt = Number.isFinite(secs) && secs > 0 ? new Date(secs * 1000) : new Date();
      const res = await db
        .insert(whatsappIntake)
        .values({
          waMessageId: m.messageId,
          fromNumber: m.from,
          senderName: m.name,
          body: m.text,
          msgType: m.type,
          receivedAt,
          raw: payload as object,
        })
        .onConflictDoNothing({ target: whatsappIntake.waMessageId })
        .returning({ id: whatsappIntake.id });
      if (res.length > 0) stored += 1;
    } catch (e) {
      // PII-minimal error log; never block the 200 ACK on a storage hiccup.
      console.error(`[whatsapp] failed to store ${m.messageId}:`, e instanceof Error ? e.message : e);
    }
  }

  // Meta requires a fast 200; anything else triggers delivery retries.
  return NextResponse.json({ ok: true, received: messages.length, stored });
}
