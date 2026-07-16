import { NextRequest, NextResponse } from 'next/server';
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
// Persistence of inbound messages into Data Reports is the NEXT slice — this
// verifies the signature and parses messages so the pipe is proven first. For now
// valid inbound messages are logged (PII-minimal) and acknowledged with 200.

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
  for (const m of messages) {
    // PII-minimal log (matches the project's audit posture): who + type + when,
    // not the message body. Real persistence into Data Reports lands next slice.
    console.log(`[whatsapp] inbound ${m.type} from ${m.from} (${m.name ?? 'unknown'}) @ ${m.timestamp}`);
    // TODO(next): persist as a report-intake row → surface in /reports.
  }

  // Meta requires a fast 200; anything else triggers delivery retries.
  return NextResponse.json({ ok: true, received: messages.length });
}
