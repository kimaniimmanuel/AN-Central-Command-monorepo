import crypto from 'node:crypto';

// WhatsApp Business Cloud API (Meta) helper.
//
// Scope (deliberate): a campaign number that RECEIVES messages (members reporting
// what's happening in their groups) and SENDS messages (nightly report + alerts to
// Alfayo/admins). The official API cannot read group chats — this never attempts to.
//
// All secrets come from env (see .env.example). Nothing is hard-coded, and the
// integration is inert until the env vars are filled, so committing this is safe.

const API_VERSION = process.env.WHATSAPP_API_VERSION || 'v21.0';

export interface WhatsAppConfig {
  accessToken: string;
  phoneNumberId: string;
  appSecret: string;
  verifyToken: string;
}

/** Returns the config only if fully set; otherwise null (integration disabled). */
export function getWhatsAppConfig(): WhatsAppConfig | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  const verifyToken = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!accessToken || !phoneNumberId || !appSecret || !verifyToken) return null;
  return { accessToken, phoneNumberId, appSecret, verifyToken };
}

export function isWhatsAppEnabled(): boolean {
  return getWhatsAppConfig() !== null;
}

/**
 * Verify the X-Hub-Signature-256 header Meta sends on every webhook POST, using
 * the App Secret. MUST be called on the RAW request body (not re-serialized JSON),
 * or the HMAC won't match. Constant-time comparison.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(signatureHeader);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export interface InboundMessage {
  from: string;         // sender's WhatsApp number (E.164, no +)
  name: string | null;  // WhatsApp profile name, if present
  messageId: string;
  timestamp: string;    // unix seconds (string, as Meta sends)
  type: string;         // 'text' | 'image' | ...
  text: string | null;  // body for text messages
}

/**
 * Flatten Meta's nested webhook payload into a simple list of inbound messages.
 * Ignores status callbacks (delivered/read) — we only care about people writing in.
 */
export function parseInboundMessages(payload: unknown): InboundMessage[] {
  const out: InboundMessage[] = [];
  const entries = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) return out;

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;
    for (const change of changes) {
      const value = (change as { value?: any })?.value;
      const messages = value?.messages;
      if (!Array.isArray(messages)) continue;
      const contacts = value?.contacts as { profile?: { name?: string }; wa_id?: string }[] | undefined;
      const nameByWaId = new Map<string, string>();
      for (const c of contacts ?? []) {
        if (c.wa_id && c.profile?.name) nameByWaId.set(c.wa_id, c.profile.name);
      }
      for (const m of messages) {
        out.push({
          from: String(m.from ?? ''),
          name: nameByWaId.get(String(m.from ?? '')) ?? null,
          messageId: String(m.id ?? ''),
          timestamp: String(m.timestamp ?? ''),
          type: String(m.type ?? 'unknown'),
          text: m.type === 'text' ? String(m.text?.body ?? '') : null,
        });
      }
    }
  }
  return out;
}

/**
 * Send a plain text WhatsApp message from the campaign number. Note: outside the
 * 24-hour customer-service window, Meta requires a pre-approved TEMPLATE rather
 * than free text — sendTemplate() handles that case (report alerts should use a
 * template so they can be sent any time).
 */
export async function sendWhatsAppText(to: string, body: string): Promise<{ ok: boolean; error?: string }> {
  const cfg = getWhatsAppConfig();
  if (!cfg) return { ok: false, error: 'WhatsApp not configured' };
  return post(cfg, {
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { preview_url: false, body },
  });
}

/** Send a pre-approved template message (required for proactive/out-of-window sends). */
export async function sendWhatsAppTemplate(
  to: string,
  templateName: string,
  languageCode = 'en',
  components?: unknown[],
): Promise<{ ok: boolean; error?: string }> {
  const cfg = getWhatsAppConfig();
  if (!cfg) return { ok: false, error: 'WhatsApp not configured' };
  return post(cfg, {
    messaging_product: 'whatsapp',
    to,
    type: 'template',
    template: { name: templateName, language: { code: languageCode }, ...(components ? { components } : {}) },
  });
}

async function post(cfg: WhatsAppConfig, payload: unknown): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(`https://graph.facebook.com/${API_VERSION}/${cfg.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, error: `WhatsApp API ${res.status}: ${detail.slice(0, 300)}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'network error' };
  }
}
