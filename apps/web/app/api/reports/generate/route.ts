import { NextResponse } from 'next/server';
import { getServerAuth } from '@/lib/server-auth';

export const runtime = 'nodejs';

// POST /api/reports/generate
//
// Regenerates the daily Data Report. This is the endpoint the nightly cron hits
// at 00:00 (midnight) EAT, and the same one the "Generate now" button calls.
//
// TODAY: the report is rendered from the demo data module, so there is nothing to
// recompute server-side yet — this returns ok so the UI flow (button → refresh)
// works end to end. WHEN INGESTION IS WIRED this is where we will:
//   1. pull the day's collected posts/comments/messages per platform,
//   2. summarize them into ranked "case points" via the Claude API,
//   3. persist a dated report row, and
//   4. fire the in-app + external "report ready" notification.
//
// Privileged only (leadership/admins) — mirrors the Data Centre menu gate.
const PRIVILEGED = new Set([
  'candidate', 'campaign_manager', 'chief_strategist', 'constituency_coordinator', 'tech_lead',
]);

export async function POST() {
  const claims = await getServerAuth();
  if (!claims) {
    return NextResponse.json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'Sign in required' } }, { status: 401 });
  }
  if (!PRIVILEGED.has(claims.role)) {
    return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'Leadership only' } }, { status: 403 });
  }

  // No-op regeneration for now (demo data). Timestamp is stamped by the page.
  return NextResponse.json({
    success: true,
    data: { regeneratedAt: new Date().toISOString(), note: 'Demo report — real generation activates when sources are connected.' },
  });
}
