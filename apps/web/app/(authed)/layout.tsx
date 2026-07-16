import { eq, isNull, asc } from 'drizzle-orm';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { authCredentials, db, people, villages, wards } from '@an/db';
import { AutoBreadcrumbs } from '@/components/auto-breadcrumbs';
import { BackButton } from '@/components/back-button';
import { BottomNav } from '@/components/bottom-nav';
import { Countdown } from '@/components/countdown';
import { QuickAdd } from '@/components/quick-add';
import { SiteFooter } from '@/components/site-footer';
import { TopNav } from '@/components/top-nav';
import { getServerAuthOrRedirect } from '@/lib/server-auth';

// Route-group layout. Every page under apps/web/app/(authed)/ goes through this:
//   1. Verify session (redirect to /login on failure).
//   2. Fetch the person row + ward name for the navbar.
//   3. Render shell with navbar + sidebar around children.
//
// Note: this layout query runs as DB superuser (no setRequestContext). It only reads
// the user's own row + the ward they're already known to belong to — minimal exposure.
// Page-level queries use withRlsTx() to scope everything else.

export default async function AuthedLayout({ children }: { children: React.ReactNode }) {
  const claims = await getServerAuthOrRedirect();

  const personRows = await db
    .select({
      id: people.id,
      fullName: people.fullName,
      role: people.role,
      wardId: people.wardId,
    })
    .from(people)
    .where(eq(people.id, claims.sub))
    .limit(1);

  if (personRows.length === 0) {
    // Session points at a person that no longer exists; treat as orphaned.
    const { redirect } = await import('next/navigation');
    redirect('/login?reason=orphaned');
  }
  const person = personRows[0]!;

  // Nudge users who are still on their system default password (their National ID).
  const credRows = await db
    .select({ mustChange: authCredentials.mustChangePassword })
    .from(authCredentials)
    .where(eq(authCredentials.personId, claims.sub))
    .limit(1);
  const mustChangePassword = credRows[0]?.mustChange ?? false;

  // Access model:
  //   • Super Admins, constituency leadership, Ward Reps + their Assistants, and
  //     Department Heads can VIEW everything in the app (all wards). Their writes
  //     stay ward-scoped at the DB layer (RLS) — they can only ADD in their ward.
  //   • Ordinary field members (canvasser, polling agent, polling station lead,
  //     influence liaison) remain limited to Home + their own ward + their account.
  // Keep this VIEW_ALL_ROLES set in sync with rls_can_view_all() in
  // packages/db/extras/05_view_all_reads.sql.
  const SUPER_ADMINS = new Set(['Alfayo Nelson', 'Benson Imoli', 'Dan Ngure', 'Irene Mkamburi']);
  const VIEW_ALL_ROLES = new Set([
    'candidate', 'campaign_manager', 'chief_strategist', 'constituency_coordinator', 'tech_lead',
    'ward_coordinator', 'assistant_ward_coordinator',
    'media_head', 'comms_head', 'finance_lead', 'patron_ceo',
  ]);
  const hasFullAccess = SUPER_ADMINS.has(person.fullName) || VIEW_ALL_ROLES.has(person.role);
  const pathname = headers().get('x-pathname') ?? '';
  if (!hasFullAccess && person.wardId) {
    // Ward members get: the full Home page, their own ward hub, their account, and
    // the Team directory (which RLS scopes to just their ward's team). Everything
    // else — other wards, the polling-station index, constituency voter search — is
    // out of reach, and RLS would return nothing for another ward anyway.
    const allowed =
      pathname === '/' ||
      pathname === '/dashboard' ||
      pathname.startsWith('/account') ||
      pathname.startsWith('/team') ||
      pathname.startsWith(`/wards/${person.wardId}`);
    if (!allowed) redirect('/dashboard');
  }

  let wardName: string | null = null;
  if (person.wardId) {
    const wardRows = await db
      .select({ name: wards.name })
      .from(wards)
      .where(eq(wards.id, person.wardId))
      .limit(1);
    wardName = wardRows[0]?.name ?? null;
  }

  // All wards — feeds the "Wards" mega-menu in the top nav (id + name only).
  const allWards = await db
    .select({ id: wards.id, name: wards.name })
    .from(wards)
    .orderBy(wards.name);

  // All villages — feeds the "Villages" mega-menu (clustered by ward).
  const allVillages = await db
    .select({ id: villages.id, name: villages.name, wardId: villages.wardId, section: villages.section })
    .from(villages)
    .where(isNull(villages.deletedAt))
    .orderBy(asc(villages.section), asc(villages.name));

  return (
    <div className="min-h-screen flex flex-col bg-brand-darkBg">
      <TopNav user={{ fullName: person.fullName, role: person.role, wardName }} wards={allWards} villages={allVillages} />
      {/* SRS FR-090 — hero countdown strip, full-width below the main navbar. */}
      <Countdown />
      {/* First-login nudge: still on the default (National ID) password. */}
      {mustChangePassword && (
        <div className="bg-brand-burnt/10 border-b border-brand-burnt/30">
          <div className="max-w-[1600px] mx-auto px-4 lg:px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap">
            <span className="text-sm font-semibold text-brand-burnt">
              {/* Phones get the short version — same message, half the words. */}
              <span className="sm:hidden">🔑 Set a new password</span>
              <span className="hidden sm:inline">
                🔑 You&apos;re still using your default password (your National ID). Please set a new one.
              </span>
            </span>
            <Link
              href="/account/password"
              className="shrink-0 rounded-lg bg-brand-burnt px-3 py-1.5 text-xs font-bold text-white hover:bg-brand-rust transition"
            >
              Change →
            </Link>
          </div>
        </div>
      )}
      <main className="flex-1 overflow-auto">
        <div className="max-w-[1600px] mx-auto p-4 lg:p-6">
          {/* empty:hidden — on pages where both render null (e.g. Home) the row
              collapses instead of leaving a blank 12px gap on phones. Breadcrumbs
              are desktop-only; on phones the Back button + bottom nav orient you. */}
          <div className="flex items-center gap-3 flex-wrap mb-3 empty:hidden">
            <BackButton />
            <span className="hidden sm:contents">
              <AutoBreadcrumbs />
            </span>
          </div>
          {children}
        </div>
        {/* Full-width per-page footer — the hero photo changes per route.
            See apps/web/components/site-footer.tsx for the route → image map. */}
        <SiteFooter />
        {/* Reserve space on mobile so the fixed bottom nav never covers content. */}
        <div className="h-20 md:hidden" aria-hidden />
      </main>
      {/* Global quick-entry — log an activity from anywhere; flows into the system. */}
      <QuickAdd wards={allWards} />
      {/* Persistent mobile bottom navigation — always one tap back to safety. */}
      <BottomNav />
    </div>
  );
}
