import Link from 'next/link';
import { and, eq, gte, isNotNull, isNull, sql, inArray, desc } from 'drizzle-orm';
import {
  activities,
  communitySites,
  db,
  meetings,
  people,
  pollingStations,
  voters,
  wards,
} from '@an/db';
import { getServerAuthOrRedirect } from '@/lib/server-auth';
import { withRlsTx } from '@/lib/api';
import { WARD_TEAMS } from '@/data/ward-teams';
import { ConstituencyMap } from '@/components/map/constituency-map';
import { KpiTile, KpiIcons } from '@/components/kpi-tile';
import { CoverageDonut } from '@/components/coverage-donut';
import { PhoneActions } from '@/components/phone-actions';

// Home — the single-pane summary. Pulls live data from every other page so
// nobody needs to leave home for the day-to-day numbers:
//   • Voter demographics (Voters page)
//   • Polling stations (Wards / station detail)
//   • Site coverage by category (Wards › Sites)
//   • Unvisited sites (top targets for outreach)
//   • Upcoming meetings (Meetings page)
//   • Per-ward leaderboard (Wards index)
//
// Everything is clickable — KPIs link to the relevant search/list, ward cards
// open the ward, meetings open the meeting page.

const ISSUE_LABEL: Record<string, string> = {
  water: 'Water supply',
  sanitation: 'Sanitation',
  garbage: 'Garbage',
  drainage: 'Drainage / flooding',
  roads: 'Roads',
  security: 'Security',
  electricity: 'Electricity',
  youth_unemployment: 'Youth unemployment',
  healthcare: 'Healthcare',
  education: 'Education',
};

// Site type → category bucket (matches the Sites tab on ward pages).
const SITE_CATEGORIES = [
  { key: 'mosques',  label: 'Mosques',  types: ['mosque', 'madrasa'] },
  { key: 'churches', label: 'Churches', types: ['church'] },
  { key: 'social',   label: 'Social halls', types: ['social_hall', 'community_hall', 'youth_center', 'sports_club'] },
  { key: 'boda',     label: 'Boda stages',  types: ['boda_stage'] },
  { key: 'other',    label: 'Other',
    types: ['matatu_stage', 'market', 'shopping_center', 'school_primary', 'school_secondary',
            'school_other', 'chama', 'sacco', 'self_help_group', 'health_facility',
            'government_office', 'other'] },
] as const;

export default async function DashboardPage() {
  const claims = await getServerAuthOrRedirect();

  const summary = await withRlsTx(claims, async (tx) => {
    // ── Per-ward roll-up ───────────────────────────────────────────────
    const wardRowsRaw = await tx
      .select({
        id: wards.id,
        name: wards.name,
        coveragePercent: wards.coveragePercent,
        topIssueCategory: wards.topIssueCategory,
        lng: sql<number>`ST_X(${wards.centroid}::geometry)`,
        lat: sql<number>`ST_Y(${wards.centroid}::geometry)`,
      })
      .from(wards)
      .orderBy(wards.name);

    const [
      voterCounts,
      phoneCounts,
      stationCounts,
      siteCounts,
      sitesVisitedCounts,
      sitesByTypeRows,
    ] = await Promise.all([
      tx.select({ wardId: voters.wardId, c: sql<number>`count(*)::int` })
        .from(voters)
        .where(isNull(voters.consentWithdrawnAt))
        .groupBy(voters.wardId),
      tx.select({ wardId: voters.wardId, c: sql<number>`count(*)::int` })
        .from(voters)
        .where(and(isNull(voters.consentWithdrawnAt), isNotNull(voters.phone)))
        .groupBy(voters.wardId),
      tx.select({ wardId: pollingStations.wardId, c: sql<number>`count(*)::int` })
        .from(pollingStations)
        .where(eq(pollingStations.active, true))
        .groupBy(pollingStations.wardId),
      tx.select({ wardId: communitySites.wardId, c: sql<number>`count(*)::int` })
        .from(communitySites)
        .where(isNull(communitySites.deletedAt))
        .groupBy(communitySites.wardId),
      tx.select({ wardId: communitySites.wardId, c: sql<number>`count(*)::int` })
        .from(communitySites)
        .where(and(isNull(communitySites.deletedAt), eq(communitySites.visited, true)))
        .groupBy(communitySites.wardId),
      // Sites grouped by type so we can show coverage per category.
      tx.select({
          type: communitySites.type,
          total: sql<number>`count(*)::int`,
          visited: sql<number>`count(*) FILTER (WHERE ${communitySites.visited} = true)::int`,
        })
        .from(communitySites)
        .where(isNull(communitySites.deletedAt))
        .groupBy(communitySites.type),
    ]);

    const voterCountMap        = new Map(voterCounts.map((r) => [r.wardId, r.c]));
    const phoneCountMap        = new Map(phoneCounts.map((r) => [r.wardId, r.c]));
    const stationCountMap      = new Map(stationCounts.map((r) => [r.wardId, r.c]));
    const siteCountMap         = new Map(siteCounts.map((r) => [r.wardId, r.c]));
    const sitesVisitedCountMap = new Map(sitesVisitedCounts.map((r) => [r.wardId, r.c]));

    const wardRows = wardRowsRaw.map((w) => ({
      ...w,
      voterCount:      voterCountMap.get(w.id)        ?? 0,
      votersWithPhone: phoneCountMap.get(w.id)        ?? 0,
      stationCount:    stationCountMap.get(w.id)      ?? 0,
      siteCount:       siteCountMap.get(w.id)         ?? 0,
      sitesVisited:    sitesVisitedCountMap.get(w.id) ?? 0,
    }));

    const stationRows = await tx
      .select({
        id: pollingStations.id,
        name: pollingStations.name,
        wardId: pollingStations.wardId,
        lng: sql<number>`ST_X(${pollingStations.location}::geometry)`,
        lat: sql<number>`ST_Y(${pollingStations.location}::geometry)`,
      })
      .from(pollingStations)
      .where(eq(pollingStations.active, true));

    // ── Constituency totals ───────────────────────────────────────────
    const totalVoters = wardRows.reduce((s, w) => s + (w.voterCount ?? 0), 0);
    const totalVotersWithPhone = wardRows.reduce((s, w) => s + (w.votersWithPhone ?? 0), 0);
    const totalStations = wardRows.reduce((s, w) => s + (w.stationCount ?? 0), 0);
    const totalSites = wardRows.reduce((s, w) => s + (w.siteCount ?? 0), 0);
    const totalSitesVisited = wardRows.reduce((s, w) => s + (w.sitesVisited ?? 0), 0);
    const totalSitesUnvisited = totalSites - totalSitesVisited;

    // ── Demographics roll-up ──────────────────────────────────────────
    const [demoRow] = await tx.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE ${voters.gender} = 'M')::int AS men,
        COUNT(*) FILTER (WHERE ${voters.gender} = 'F')::int AS women,
        COUNT(*) FILTER (WHERE ${voters.gender} = 'U')::int AS unknown,
        COUNT(*) FILTER (
          WHERE ${voters.dateOfBirth} IS NOT NULL
            AND date_part('year', age(${voters.dateOfBirth})) BETWEEN 18 AND 34
        )::int AS youth_count
      FROM ${voters}
      WHERE ${voters.consentWithdrawnAt} IS NULL
    `) as any[];

    // ── Upcoming meetings (Meetings page summary) ─────────────────────
    const now = new Date();
    const upcomingMeetings = await tx
      .select({
        id: meetings.id,
        title: meetings.title,
        type: meetings.type,
        scheduledAt: meetings.scheduledAt,
        location: meetings.location,
        status: meetings.status,
        inviteePersonIds: meetings.inviteePersonIds,
      })
      .from(meetings)
      .where(and(
        gte(meetings.scheduledAt, now),
        isNull(meetings.deletedAt),
        inArray(meetings.status, ['scheduled', 'confirmed']),
      ))
      .orderBy(meetings.scheduledAt)
      .limit(5);

    // Resolve invitees (phone + name) so Home can fire WhatsApp/SMS reminders.
    const inviteeIds = new Set<string>();
    upcomingMeetings.forEach((m) => (m.inviteePersonIds ?? []).forEach((id) => inviteeIds.add(id)));
    let inviteeMap = new Map<string, { id: string; fullName: string; phone: string }>();
    if (inviteeIds.size > 0) {
      const rows = await tx
        .select({ id: people.id, fullName: people.fullName, phone: people.phone })
        .from(people)
        .where(inArray(people.id, Array.from(inviteeIds)));
      inviteeMap = new Map(rows.map((r) => [r.id, r]));
    }
    const inviteesByMeeting: Record<string, { id: string; fullName: string; phone: string }[]> = {};
    upcomingMeetings.forEach((m) => {
      inviteesByMeeting[m.id] = (m.inviteePersonIds ?? [])
        .map((id) => inviteeMap.get(id))
        .filter((p): p is { id: string; fullName: string; phone: string } => !!p);
    });

    // ── Upcoming site activities (overlap with Itinerary) ─────────────
    const upcomingActivities = await tx
      .select({
        id: activities.id,
        title: activities.title,
        type: activities.type,
        scheduledAt: activities.scheduledAt,
        wardId: activities.wardId,
        locationName: activities.locationName,
        status: activities.status,
      })
      .from(activities)
      .where(and(gte(activities.scheduledAt, now), isNull(activities.deletedAt)))
      .orderBy(activities.scheduledAt)
      .limit(5);

    // ── Top unvisited sites (outreach targets) ────────────────────────
    const topUnvisited = await tx
      .select({
        id: communitySites.id,
        name: communitySites.name,
        type: communitySites.type,
        areaName: communitySites.areaName,
        wardId: communitySites.wardId,
        wardName: wards.name,
      })
      .from(communitySites)
      .leftJoin(wards, eq(wards.id, communitySites.wardId))
      .where(and(
        isNull(communitySites.deletedAt),
        eq(communitySites.visited, false),
      ))
      .orderBy(desc(communitySites.createdAt))
      .limit(6);

    // ── Team size (Team Directory) ────────────────────────────────────
    // Matches the Team page total: every active DB person PLUS the ward field-team
    // roster members that aren't already a DB person (de-duplicated by name/ward).
    // Read via `db` (NOT the RLS-scoped tx) so ward-scoped viewers still see the
    // whole-constituency count — the Team Directory is org info everyone may see,
    // and otherwise a ward member's Home page would only count their own ward.
    const teamPeople = await db
      .select({ fullName: people.fullName, wardId: people.wardId })
      .from(people)
      .where(and(
        eq(people.active, true),
        isNull(people.deletedAt),
        // Ignore login-only accounts (Dan's previews + the bulk Warembo/Flames/
        // ward-team login rows) so the count matches the Team Directory (63).
        sql`(${people.title} IS NULL OR ${people.title} NOT IN ('Preview account', 'Warembo wa Alfayo', 'Alfayo Flames', 'Ward teams'))`,
      ));
    const normName = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
    const wardNameById = new Map(wardRows.map((w) => [w.id, w.name]));
    const dbNamesByWardName = new Map<string, Set<string>>();
    for (const p of teamPeople) {
      const wn = p.wardId ? wardNameById.get(p.wardId) : null;
      if (!wn) continue;
      if (!dbNamesByWardName.has(wn)) dbNamesByWardName.set(wn, new Set());
      dbNamesByWardName.get(wn)!.add(normName(p.fullName));
    }
    let extraFieldTeam = 0;
    for (const t of WARD_TEAMS) {
      const names = dbNamesByWardName.get(t.ward) ?? new Set<string>();
      extraFieldTeam += t.members.filter((m) => !names.has(normName(m.name))).length;
    }
    const teamSize = teamPeople.length + extraFieldTeam;

    return {
      wardRows,
      stationRows,
      totals: {
        voters: totalVoters,
        votersWithPhone: totalVotersWithPhone,
        stations: totalStations,
        sites: totalSites,
        sitesVisited: totalSitesVisited,
        sitesUnvisited: totalSitesUnvisited,
        men: Number(demoRow?.men ?? 0),
        women: Number(demoRow?.women ?? 0),
        unknownGender: Number(demoRow?.unknown ?? 0),
        youthCount: Number(demoRow?.youth_count ?? 0),
        teamSize: Number(teamSize),
      },
      sitesByType: sitesByTypeRows.map((r) => ({
        type: r.type,
        total: Number(r.total),
        visited: Number(r.visited),
      })),
      upcomingMeetings,
      inviteesByMeeting,
      upcomingActivities,
      topUnvisited,
    };
  });

  const { totals } = summary;
  const pct = (n: number, d: number) => (d > 0 ? (n / d) * 100 : 0);
  const phoneReachPct   = pct(totals.votersWithPhone, totals.voters);
  const youthPct        = pct(totals.youthCount,      totals.voters);
  const womenPct        = pct(totals.women,           totals.voters);
  const menPct          = pct(totals.men,             totals.voters);

  // Ward coverage = share of each ward's community sites that have been visited.
  // The donut headline is the AVERAGE across wards that have any sites — i.e. how
  // we are fairing on ground coverage constituency-wide.
  const wardCoverage = summary.wardRows
    .map((w) => ({ id: w.id, name: w.name, pct: pct(w.sitesVisited, w.siteCount), hasSites: w.siteCount > 0 }))
    .sort((a, b) => b.pct - a.pct);
  const coveredWards = wardCoverage.filter((w) => w.hasSites);
  const avgCoverage = coveredWards.length
    ? coveredWards.reduce((s, w) => s + w.pct, 0) / coveredWards.length
    : 0;

  // Roll site rows up into the category buckets the ward Sites tab uses.
  const categoryTotals = SITE_CATEGORIES.map((cat) => {
    const types: readonly string[] = cat.types;
    const inCat = summary.sitesByType.filter((s) => types.includes(s.type));
    const total = inCat.reduce((s, r) => s + r.total, 0);
    const visited = inCat.reduce((s, r) => s + r.visited, 0);
    return { ...cat, total, visited, pct: pct(visited, total) };
  });

  return (
    <div className="space-y-5 sm:space-y-8">
      {/* ── Bold gradient hero banner ──────────────────────────────────── */}
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-burnt via-brand-rust to-brand-teal p-4 sm:p-8 shadow-xl">
        {/* decorative gold glow */}
        <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-brand-gold/20 blur-3xl pointer-events-none" />
        <div className="relative space-y-2">
          <div className="hidden sm:block text-[11px] font-bold uppercase tracking-[0.4em] text-white/80">
            Welcome to
          </div>
          <h1 className="text-xl sm:text-3xl lg:text-5xl font-black text-white uppercase tracking-tight leading-tight drop-shadow">
            ALFAYO <span className="text-brand-gold">CENTRAL COMMAND</span>
          </h1>
          {/* Mission statement is desktop copy — phones go straight to the actions. */}
          <p className="hidden sm:block text-sm sm:text-base text-white/90 font-semibold uppercase tracking-wide leading-snug max-w-3xl">
            Where we view Nyali data and analyze it to establish a{' '}
            <span className="text-brand-gold">victory for Alfayo Nelson</span> in the{' '}
            <span className="text-white underline decoration-brand-gold decoration-2 underline-offset-2">2027 Nyali race</span>.
          </p>
          {/* Phones: one swipeable row (no wrap = no tall pile of chips). */}
          <div className="flex gap-2 pt-2 sm:pt-3 overflow-x-auto sm:flex-wrap sm:overflow-visible -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <HeroChip href="/meetings?action=new" solid>+ Schedule meeting</HeroChip>
            <HeroChip href="/voters">Search voters</HeroChip>
            <HeroChip href="/wards">Browse wards</HeroChip>
            <HeroChip href="/meetings?view=unvisited">Find unvisited sites</HeroChip>
            <HeroChip href="/analytics">Analytics & polls</HeroChip>
          </div>
        </div>
      </header>

      {/* ── Primary KPI ribbon — coloured by ANHF palette ─────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3">
        <KpiTile
          label="Voters"
          value={totals.voters.toLocaleString()}
          hint={`Across ${totals.stations} polling centres`}
          tone="teal"
          icon={KpiIcons.Users}
          href="/voters"
        />
        <KpiTile
          label="Phone reach"
          value={`${phoneReachPct.toFixed(1)}%`}
          hint={`${totals.votersWithPhone.toLocaleString()} reachable`}
          tone="orange"
          icon={KpiIcons.Phone}
          href="/voters?hasPhone=1"
        />
        <KpiTile
          label="Men"
          value={`${menPct.toFixed(1)}%`}
          hint={`${totals.men.toLocaleString()} voters`}
          tone="aqua"
          icon={KpiIcons.Male}
          href="/voters?gender=M"
        />
        <KpiTile
          label="Women"
          value={`${womenPct.toFixed(1)}%`}
          hint={`${totals.women.toLocaleString()} voters`}
          tone="sky"
          icon={KpiIcons.Female}
          href="/voters?gender=F"
        />
        <KpiTile
          label="Youth (18-34)"
          value={`${youthPct.toFixed(1)}%`}
          hint={`${totals.youthCount.toLocaleString()} voters`}
          tone="deepBlue"
          icon={KpiIcons.Spark}
          href="/voters?age=youth"
        />
        <KpiTile
          label="Polling centres"
          value={totals.stations}
          hint="30 centres · 158 stations"
          tone="teal"
          icon={KpiIcons.Pin}
          href="/polling-stations"
        />
        <KpiTile
          label="Team"
          value={totals.teamSize}
          hint={`${totals.teamSize} active members`}
          tone="amber"
          icon={KpiIcons.Building}
          href="/team?group=members"
        />
      </section>

      {/* ── Ward coverage donut ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionTitle
          title="Ward coverage"
          subtitle="Average share of community sites visited per ward — how we are fairing on the ground"
        />
        <CoverageDonut average={avgCoverage} wards={wardCoverage} />
      </section>

      {/* ── Constituency map ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionTitle title="Constituency map" subtitle="Wards + every polling station, live" />
        <ConstituencyMap
          wards={summary.wardRows.map((w) => ({
            id: w.id,
            name: w.name,
            registeredVoters: w.voterCount,
            coveragePercent: w.coveragePercent,
            topIssueCategory: w.topIssueCategory,
            lng: w.lng,
            lat: w.lat,
          }))}
          stations={summary.stationRows}
        />
      </section>

      {/* ── Site coverage strip ─────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionTitle title="Site coverage" subtitle="Visited vs total per category — click to find unvisited sites" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {categoryTotals.map((cat, i) => {
            const tones: Array<'teal' | 'orange' | 'aqua' | 'sky' | 'deepBlue'> = ['teal', 'orange', 'aqua', 'sky', 'deepBlue'];
            return (
              <CategoryCoverage
                key={cat.key}
                label={cat.label}
                visited={cat.visited}
                total={cat.total}
                pct={cat.pct}
                tone={tones[i % tones.length]}
                href={`/wards/coverage#cat-${cat.key}`}
              />
            );
          })}
        </div>
      </section>

      {/* ── Two-column: Upcoming + Unvisited targets ────────────────────── */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming meetings */}
        <Panel
          accent="orange"
          title="Upcoming meetings"
          subtitle={`${summary.upcomingMeetings.length} on the calendar`}
          actionLabel="View all"
          actionHref="/meetings"
        >
          {summary.upcomingMeetings.length === 0 ? (
            <EmptyHint
              text="No meetings scheduled."
              ctaText="Schedule one"
              ctaHref="/meetings?action=new"
            />
          ) : (
            <ul className="space-y-2">
              {summary.upcomingMeetings.map((m) => {
                const invitees = summary.inviteesByMeeting[m.id] ?? [];
                const whenStr = new Date(m.scheduledAt).toLocaleString('en-KE', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
                return (
                  <li key={m.id} className="rounded-lg border border-brand-border bg-brand-cardBgHeavy px-3 py-2">
                    <Link href={`/meetings#${m.id}`} className="flex items-center justify-between gap-3 group">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-brand-textActive truncate group-hover:text-brand-orangeBright transition">{m.title}</div>
                        <div className="text-[11px] text-brand-textMuted">
                          {whenStr}
                          {m.location && <> · {m.location}</>}
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider text-brand-orangeBright shrink-0">{m.status}</span>
                    </Link>
                    {invitees.length > 0 && (
                      <div className="mt-2 pt-2 border-t border-brand-border/50">
                        <div className="text-[10px] uppercase tracking-wider text-brand-textMuted font-bold mb-1.5">
                          Remind {invitees.length} invitee{invitees.length === 1 ? '' : 's'}
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {invitees.map((p) => (
                            <div key={p.id} className="flex items-center gap-1.5 bg-brand-cardBg rounded-md px-2 py-1">
                              <span className="text-[11px] font-semibold text-brand-textActive">{p.fullName.split(' ')[0]}</span>
                              <PhoneActions
                                phone={p.phone}
                                size="sm"
                                defaultMessage={`Hi ${p.fullName.split(' ')[0]}, reminder for "${m.title}" on ${whenStr}${m.location ? ` at ${m.location}` : ''}. Asante!`}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>

        {/* Unvisited site targets */}
        <Panel
          accent="teal"
          title="Unvisited sites"
          subtitle={`${totals.sitesUnvisited.toLocaleString()} sites still to be reached`}
          actionLabel="Search all"
          actionHref="/meetings?view=unvisited"
        >
          {summary.topUnvisited.length === 0 ? (
            <EmptyHint text="🎉 Every site has been visited." />
          ) : (
            <ul className="space-y-2">
              {summary.topUnvisited.map((s) => (
                <li key={s.id}>
                  <Link
                    href={`/wards/${s.wardId}?tab=sites`}
                    className="flex items-center justify-between gap-3 rounded-lg border border-brand-border bg-brand-cardBgHeavy px-3 py-2 hover:border-brand-tealBlue/60 transition"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-brand-textActive truncate">{s.name}</div>
                      <div className="text-[11px] text-brand-textMuted">
                        {s.type.replace(/_/g, ' ')}
                        {s.areaName && <> · {s.areaName}</>}
                        {s.wardName && <> · {s.wardName}</>}
                      </div>
                    </div>
                    <span className="text-[10px] uppercase font-bold tracking-wider text-brand-tealBright shrink-0">visit</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </section>

      {/* ── Ward leaderboard ────────────────────────────────────────────── */}
      <section className="space-y-3">
        <SectionTitle
          title="Wards"
          subtitle={`${summary.wardRows.length} wards · click to dive in`}
          actionLabel="Wards index"
          actionHref="/wards"
        />
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {summary.wardRows.map((w) => {
            const wardPhonePct = pct(w.votersWithPhone, w.voterCount);
            const wardVisitedPct = pct(w.sitesVisited, w.siteCount);
            return (
              <Link
                key={w.id}
                href={`/wards/${w.id}`}
                className="group relative overflow-hidden rounded-xl border border-brand-border bg-brand-cardBg p-4 hover:border-brand-tealBlue/60 hover:shadow-brand-teal transition"
              >
                <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-tealBlue via-brand-skyBlue to-brand-orangeBright" />
                <div className="flex items-center justify-between">
                  <div className="font-semibold text-brand-textActive group-hover:text-brand-skyBlue transition">{w.name}</div>
                  <div className="text-xs text-brand-textMuted tabular-nums">
                    {w.voterCount.toLocaleString()} voters
                  </div>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                  <Mini label="Stations" value={w.stationCount} />
                  <Mini label="Sites" value={w.siteCount} />
                  <Mini label="Phones" value={`${wardPhonePct.toFixed(0)}%`} />
                </div>
                <div className="mt-3 space-y-1.5">
                  <Bar label="Phone reach" value={wardPhonePct} tone="aqua" />
                  <Bar label="Sites visited" value={wardVisitedPct} tone="success" />
                </div>
                {w.topIssueCategory && (
                  <div className="mt-2 text-[10px] text-brand-textMuted">
                    Top issue:{' '}
                    <span className="text-brand-orangeBright font-semibold">
                      {ISSUE_LABEL[w.topIssueCategory] ?? w.topIssueCategory}
                    </span>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      </section>

      {/* ── Quick access bar at the bottom ──────────────────────────────── */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <NavCard href="/voters"    title="Voter Search" desc="Look up any voter constituency-wide" icon={KpiIcons.Users} tone="teal" />
        <NavCard href="/analytics" title="Analytics"    desc="Polls, history, ward comparisons"     icon={KpiIcons.Spark} tone="sky" />
        <NavCard href="/meetings"  title="Meetings"     desc="Schedule, search contacts, WhatsApp"  icon={KpiIcons.Calendar} tone="orange" />
        <NavCard href="/team?group=members" title="Team"  desc={`${totals.teamSize} active members`}   icon={KpiIcons.Building} tone="deepBlue" />
      </section>
    </div>
  );
}

// ── Small reusable pieces ─────────────────────────────────────────────────────

function QuickChip({
  href,
  children,
  tone = 'teal',
}: {
  href: string;
  children: React.ReactNode;
  tone?: 'teal' | 'orange';
}) {
  const cls = tone === 'orange'
    ? 'bg-brand-orangePrimary text-white hover:bg-brand-orangeBright shadow-brand-orange'
    : 'border border-brand-border bg-brand-cardBg text-brand-textBody hover:border-brand-tealBlue hover:text-brand-textActive';
  return (
    <Link href={href} className={`text-xs font-semibold px-3 py-1.5 rounded-full transition ${cls}`}>
      {children}
    </Link>
  );
}

// Chips for the gradient hero banner — glass pills (white) + a solid gold primary.
function HeroChip({
  href,
  children,
  solid,
}: {
  href: string;
  children: React.ReactNode;
  solid?: boolean;
}) {
  const cls = solid
    ? 'bg-brand-gold text-black hover:bg-white'
    : 'bg-white/15 text-white border border-white/30 backdrop-blur hover:bg-white/25';
  return (
    <Link href={href} className={`shrink-0 whitespace-nowrap text-xs font-bold px-3 py-1.5 rounded-full transition ${cls}`}>
      {children}
    </Link>
  );
}

function SectionTitle({
  title, subtitle, actionLabel, actionHref,
}: {
  title: string; subtitle?: string; actionLabel?: string; actionHref?: string;
}) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <h2 className="text-sm font-bold text-brand-textActive uppercase tracking-[0.14em]">{title}</h2>
        {subtitle && <p className="text-xs text-brand-textMuted mt-0.5">{subtitle}</p>}
      </div>
      {actionLabel && actionHref && (
        <Link
          href={actionHref}
          className="text-xs font-semibold text-brand-aqua hover:text-brand-skyBlue transition shrink-0"
        >
          {actionLabel} →
        </Link>
      )}
    </div>
  );
}

function Panel({
  children, title, subtitle, accent, actionLabel, actionHref,
}: {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  accent: 'teal' | 'orange' | 'sky';
  actionLabel?: string;
  actionHref?: string;
}) {
  const bar = accent === 'orange' ? 'bg-brand-orangeBright'
            : accent === 'sky'    ? 'bg-brand-skyBlue'
            :                       'bg-brand-tealBlue';
  return (
    <div className="relative rounded-xl border border-brand-border bg-brand-cardBg overflow-hidden">
      <div className={`absolute inset-x-0 top-0 h-0.5 ${bar}`} />
      <div className="p-4">
        <div className="flex items-end justify-between mb-3 gap-3">
          <div>
            <div className="text-sm font-bold text-brand-textActive">{title}</div>
            {subtitle && <div className="text-[11px] text-brand-textMuted">{subtitle}</div>}
          </div>
          {actionLabel && actionHref && (
            <Link href={actionHref} className="text-xs font-semibold text-brand-aqua hover:text-brand-skyBlue shrink-0">
              {actionLabel} →
            </Link>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}

function CategoryCoverage({
  label, visited, total, pct, tone, href,
}: {
  label: string; visited: number; total: number; pct: number;
  tone: 'teal' | 'orange' | 'aqua' | 'sky' | 'deepBlue';
  href: string;
}) {
  const fill = tone === 'orange'   ? 'bg-brand-orangeBright'
              : tone === 'aqua'     ? 'bg-brand-aqua'
              : tone === 'sky'      ? 'bg-brand-skyBlue'
              : tone === 'deepBlue' ? 'bg-brand-deepBlue'
              :                       'bg-brand-tealBlue';
  const text = tone === 'orange'   ? 'text-brand-orangeBright'
              : tone === 'aqua'     ? 'text-brand-aqua'
              : tone === 'sky'      ? 'text-brand-skyBlue'
              : tone === 'deepBlue' ? 'text-brand-skyBlue'
              :                       'text-brand-tealBright';
  return (
    <Link
      href={href}
      className="group rounded-xl border border-brand-border bg-brand-cardBg p-4 hover:border-white/30 transition block"
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-brand-textActive">{label}</div>
        <div className={`text-xs font-bold tabular-nums ${text}`}>{pct.toFixed(0)}%</div>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-black/10 overflow-hidden">
        <div className={`h-full ${fill}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <div className="mt-2 text-[11px] text-brand-textMuted">
        {visited.toLocaleString()} of {total.toLocaleString()} visited
      </div>
    </Link>
  );
}

function EmptyHint({ text, ctaText, ctaHref }: { text: string; ctaText?: string; ctaHref?: string }) {
  return (
    <div className="rounded-lg border border-dashed border-brand-border bg-brand-cardBgHeavy/40 px-4 py-6 text-center">
      <p className="text-sm text-brand-textMuted">{text}</p>
      {ctaText && ctaHref && (
        <Link
          href={ctaHref}
          className="inline-block mt-2 text-xs font-semibold text-brand-orangeBright hover:text-brand-orangePrimary"
        >
          {ctaText} →
        </Link>
      )}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number | string }) {
  return (
    <div>
      <div className="text-base font-bold text-brand-textActive tabular-nums">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-brand-textMuted">{label}</div>
    </div>
  );
}

function Bar({ label, value, tone }: { label: string; value: number; tone: 'aqua' | 'success' }) {
  const fill = tone === 'aqua' ? 'bg-brand-aqua' : 'bg-brand-success';
  return (
    <div>
      <div className="flex justify-between text-[10px] uppercase tracking-wider text-brand-textMuted">
        <span>{label}</span>
        <span className="tabular-nums">{value.toFixed(0)}%</span>
      </div>
      <div className="mt-0.5 h-1.5 rounded-full bg-black/10 overflow-hidden">
        <div className={`h-full ${fill}`} style={{ width: `${Math.min(100, value)}%` }} />
      </div>
    </div>
  );
}

function NavCard({
  href, title, desc, icon, tone,
}: {
  href: string; title: string; desc: string; icon: React.ReactNode;
  tone: 'teal' | 'orange' | 'sky' | 'deepBlue';
}) {
  const chip = tone === 'orange'   ? 'bg-brand-orangeBright/20 text-brand-orangeBright'
              : tone === 'sky'      ? 'bg-brand-skyBlue/20 text-brand-skyBlue'
              : tone === 'deepBlue' ? 'bg-brand-deepBlue/30 text-brand-skyBlue'
              :                       'bg-brand-tealBlue/20 text-brand-tealBright';
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-xl border border-brand-border bg-brand-cardBg p-4 hover:border-white/20 transition"
    >
      <div className={`w-9 h-9 rounded-md flex items-center justify-center ${chip}`}>{icon}</div>
      <div className="min-w-0">
        <div className="text-sm font-bold text-brand-textActive group-hover:text-brand-skyBlue transition truncate">{title}</div>
        <div className="text-[11px] text-brand-textMuted truncate">{desc}</div>
      </div>
    </Link>
  );
}
