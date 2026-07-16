'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { BrandMark } from './brand';
import { CommandSearch } from './command-search';
import { LogoutButton } from './logout-button';
import { ThemeToggle } from './theme-toggle';

// Top navigation — grouped dropdowns.
//
// Goal: a SIMPLE top bar where depth lives inside the dropdowns, so the whole
// app is reachable in one or two clicks without a wall of tabs.
//
//   HOME · WARDS▾ · VOTERS · ANALYSIS▾ · IMPORT▾(privileged)
//
//   WARDS ▾  → a mega-menu: every ward, each expanding into
//              Overview · Polling Stations · Sites · Issues · Community
//   ANALYSIS ▾ → Polls · 2013 · 2017 · 2022 · Demographics
//   IMPORT ▾   → Data Import · Audit Logs
//
// Desktop: click a group to open its panel; click outside / Escape / route change
//   closes it. Mobile: a drawer with the same groups as collapsible accordions.

const PRIVILEGED_ROLES = new Set([
  'candidate',
  'campaign_manager',
  'chief_strategist',
  'constituency_coordinator',
  'tech_lead',
]);

// The four Super Admins have full access to everything regardless of their job
// role (e.g. Irene is Head of Media but a Super Admin). Identity-stable by name.
const SUPER_ADMIN_NAMES = new Set([
  'Alfayo Nelson',
  'Benson Imoli',
  'Dan Ngure',
  'Irene Mkamburi',
]);

interface Ward {
  id: string;
  name: string;
}

interface Village {
  id: string;
  name: string;
  wardId: string;
  section: string | null;
}

interface SubLink {
  href: string;
  label: string;
}

const ROLE_LABEL: Record<string, string> = {
  candidate: 'Aspirant',
  campaign_manager: 'Campaign Manager',
  chief_strategist: 'Chief Strategist',
  constituency_coordinator: 'Constituency Coordinator',
  ward_coordinator: 'Ward Coordinator',
  assistant_ward_coordinator: 'Asst. Ward Coordinator',
  polling_station_lead: 'Polling Station Lead',
  polling_agent: 'Polling Agent',
  canvasser: 'Canvasser',
  influence_liaison: 'Influence Liaison',
  media_head: 'Media Head',
  comms_head: 'Comms Head',
  patron_ceo: 'Patron / CEO',
  tech_lead: 'Tech Lead',
  finance_lead: 'Finance Lead',
};

const ANALYSIS_LINKS: SubLink[] = [
  { href: '/analytics', label: 'Polls' },
  { href: '/analytics?tab=2013', label: '2013 Election' },
  { href: '/analytics?tab=2017', label: '2017 Election' },
  { href: '/analytics?tab=2022', label: '2022 Election' },
  { href: '/analytics?tab=analysis', label: 'Demographics' },
];

const TEAM_LINKS: SubLink[] = [
  { href: '/team?group=members', label: 'Members list' },
  { href: '/team?group=executive', label: 'Executive' },
  { href: '/team?group=wards', label: 'All Wards' },
  { href: '/team?group=warembo', label: 'Warembo' },
  { href: '/team?group=flames', label: 'Alfayo Flames' },
];

const IMPORT_LINKS: SubLink[] = [
  { href: '/data-import', label: 'Data Import' },
  { href: '/audit', label: 'Audit Logs' },
];

// Per-ward quick links used in both the desktop mega-menu and mobile accordion.
function wardLinks(id: string): SubLink[] {
  return [
    { href: `/wards/${id}?tab=sites`, label: 'Sites' },
    { href: `/wards/${id}?tab=sites&siteTab=schools`, label: 'Schools' },
    { href: `/wards/${id}?tab=sites&siteTab=welfare`, label: 'Welfare Groups' },
    { href: `/wards/${id}/villages`, label: 'Villages' },
    { href: `/community?ward=${id}`, label: 'Community Leaders' },
  ];
}

interface Props {
  user: { fullName: string; role: string; wardName: string | null };
  wards: Ward[];
  villages?: Village[];
}

export function TopNav({ user, wards, villages = [] }: Props) {
  const pathname = usePathname() ?? '';
  const privileged = PRIVILEGED_ROLES.has(user.role) || SUPER_ADMIN_NAMES.has(user.fullName);

  const [openMenu, setOpenMenu] = useState<string | null>(null); // desktop dropdown
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null); // accordion
  const [mobileWard, setMobileWard] = useState<string | null>(null);
  const navRef = useRef<HTMLDivElement>(null);

  // Active-group detection by path prefix.
  const activeGroup =
    pathname === '/dashboard'
      ? 'home'
      : pathname.includes('/villages')
        ? 'villages'
      : pathname.startsWith('/wards') || pathname.startsWith('/issues') || pathname.startsWith('/community')
        ? 'wards'
        : pathname.startsWith('/voters')
          ? 'voters'
          : pathname.startsWith('/analytics')
            ? 'analysis'
            : pathname.startsWith('/team') || pathname.startsWith('/meetings')
              ? 'team'
              : pathname.startsWith('/data-import') || pathname.startsWith('/audit')
                ? 'import'
                : '';

  // Close everything on route change.
  useEffect(() => {
    setOpenMenu(null);
    setMobileOpen(false);
  }, [pathname]);

  // Desktop: close dropdown on outside click + Escape.
  useEffect(() => {
    if (!openMenu) return;
    const onClick = (e: MouseEvent) => {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpenMenu(null);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu]);

  // Mobile: Escape + body-scroll lock while drawer open.
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMobileOpen(false);
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const topBtn = (group: string) =>
    [
      'inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-[13px] font-semibold tracking-wide transition whitespace-nowrap',
      activeGroup === group
        ? 'bg-brand-burnt text-white shadow-brand-teal'
        : 'text-brand-textBody hover:text-brand-textActive hover:bg-black/5',
    ].join(' ');

  // Polling Stations is now a top-level dropdown: an all-centres index first,
  // then organised by ward.
  const stationLinks: SubLink[] = [
    { href: '/polling-stations', label: '🗳️ All polling centres' },
    ...wards.map((w) => ({ href: `/wards/${w.id}?tab=stations`, label: w.name })),
  ];

  // Villages clustered by ward — for the Villages mega-menu.
  const villagesByWard = wards.map((w) => ({
    ward: w,
    villages: villages.filter((v) => v.wardId === w.id),
  })).filter((g) => g.villages.length > 0);

  return (
    <header className="sticky top-0 z-40 border-b border-brand-border bg-brand-cardBg/95 backdrop-blur-md">
      <div ref={navRef} className="flex items-center gap-2 px-4 lg:px-6 py-2.5">
        {/* Brand */}
        <Link href="/dashboard" className="shrink-0 flex items-center gap-3">
          <BrandMark size={44} variant="compact" withName={true} />
        </Link>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1 ml-4 flex-1">
          {/* Home */}
          <Link href="/dashboard" className={topBtn('home')}>
            Home
          </Link>

          {/* Wards mega-menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === 'wards' ? null : 'wards'))}
              aria-expanded={openMenu === 'wards'}
              aria-haspopup="true"
              className={topBtn('wards')}
            >
              Wards <Caret open={openMenu === 'wards'} />
            </button>
            {openMenu === 'wards' && (
              <div className="absolute left-0 mt-2 z-50 w-[min(92vw,720px)] rounded-xl border border-brand-borderStrong bg-brand-cardBg shadow-2xl p-3">
                <Link
                  href="/wards"
                  className="block px-3 py-2 mb-2 rounded-lg text-xs font-bold uppercase tracking-wider text-brand-burnt hover:bg-black/5"
                >
                  All Wards →
                </Link>
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                  {wards.map((w) => (
                    <div key={w.id} className="rounded-lg border border-brand-border bg-brand-darkBg/40 p-2">
                      <Link
                        href={`/wards/${w.id}`}
                        className="block px-2 py-1 rounded text-sm font-bold text-brand-textActive hover:text-brand-burnt"
                      >
                        {w.name}
                      </Link>
                      <div className="mt-1 flex flex-col">
                        {wardLinks(w.id).map((s) => (
                          <Link
                            key={s.href}
                            href={s.href}
                            className="px-2 py-1 rounded text-[12px] text-brand-textMuted hover:text-brand-textActive hover:bg-brand-burnt/15 transition"
                          >
                            {s.label}
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                  {/* 6th item — Ward Coverage (dedicated all-wards summary page) */}
                  <Link
                    href="/wards/coverage"
                    className="rounded-lg border border-brand-teal/40 bg-brand-teal/10 p-2 flex flex-col justify-center hover:bg-brand-teal/20 transition"
                  >
                    <span className="px-2 py-1 text-sm font-bold text-brand-teal">📊 Constituency Coverage</span>
                    <span className="px-2 text-[12px] text-brand-textMuted">All-wards summary</span>
                    <span className="px-2 text-[12px] text-brand-textMuted">Coverage · churches · mosques</span>
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Villages mega-menu — clustered by ward */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu((m) => (m === 'villages' ? null : 'villages'))}
              aria-expanded={openMenu === 'villages'}
              aria-haspopup="true"
              className={topBtn('villages')}
            >
              Villages <Caret open={openMenu === 'villages'} />
            </button>
            {openMenu === 'villages' && (
              <div className="absolute left-0 mt-2 z-50 w-72 rounded-xl border border-brand-borderStrong bg-brand-cardBg shadow-2xl p-2">
                <Link
                  href="/villages"
                  className="flex items-center gap-2 px-3 py-2 mb-1 rounded-lg text-xs font-bold uppercase tracking-wider text-brand-burnt hover:bg-black/5"
                >
                  🗺️ All-villages map →
                </Link>
                {villagesByWard.map(({ ward, villages: vs }) => (
                  <Link
                    key={ward.id}
                    href={`/wards/${ward.id}/villages`}
                    className="flex items-center justify-between px-3 py-2 rounded-lg text-sm text-brand-textBody hover:text-brand-textActive hover:bg-brand-burnt/15 transition"
                  >
                    <span className="font-semibold">{ward.name}</span>
                    <span className="text-[11px] text-brand-textMuted">{vs.length} villages</span>
                  </Link>
                ))}
                {/* Nyali — the whole constituency (all wards joined). Sits below the
                    ward list as an aggregate entry → constituency-wide map. */}
                <Link
                  href="/villages"
                  className="mt-1 flex items-center justify-between px-3 py-2 rounded-lg text-sm bg-brand-teal/10 border border-brand-teal/40 text-brand-teal hover:bg-brand-teal/20 transition"
                >
                  <span className="font-bold">🏛️ Nyali · whole constituency</span>
                  <span className="text-[11px] font-semibold">{villages.length} villages</span>
                </Link>
              </div>
            )}
          </div>

          {/* Voters */}
          <Link href="/voters" className={topBtn('voters')}>
            Voters
          </Link>

          {/* Polling Stations — by ward */}
          <DesktopDropdown
            label="Polling Stations"
            group="stations"
            active={false}
            open={openMenu === 'stations'}
            onToggle={() => setOpenMenu((m) => (m === 'stations' ? null : 'stations'))}
            links={stationLinks}
            pathname={pathname}
            topBtnClass={topBtn('stations')}
          />

          {/* Analysis */}
          <DesktopDropdown
            label="Analysis"
            group="analysis"
            active={activeGroup === 'analysis'}
            open={openMenu === 'analysis'}
            onToggle={() => setOpenMenu((m) => (m === 'analysis' ? null : 'analysis'))}
            links={ANALYSIS_LINKS}
            pathname={pathname}
            topBtnClass={topBtn('analysis')}
          />

          {/* Team */}
          <DesktopDropdown
            label="Team"
            group="team"
            active={activeGroup === 'team'}
            open={openMenu === 'team'}
            onToggle={() => setOpenMenu((m) => (m === 'team' ? null : 'team'))}
            links={TEAM_LINKS}
            pathname={pathname}
            topBtnClass={topBtn('team')}
          />

          {/* Import (privileged) */}
          {privileged && (
            <DesktopDropdown
              label="Import"
              group="import"
              active={activeGroup === 'import'}
              open={openMenu === 'import'}
              onToggle={() => setOpenMenu((m) => (m === 'import' ? null : 'import'))}
              links={IMPORT_LINKS}
              pathname={pathname}
              topBtnClass={topBtn('import')}
            />
          )}
        </nav>

        {/* Global search — subtle, always reachable (also ⌘K / "/") */}
        <div className="ml-auto shrink-0">
          <CommandSearch />
        </div>

        {/* Add CTA — the layman "+ Add" hub (church / mosque / polling / team) */}
        <Link
          href="/add"
          className="hidden md:inline-flex items-center gap-1.5 shrink-0 ml-2 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-brand-teal text-white hover:bg-brand-burnt transition"
        >
          <PlusIcon /> Add
        </Link>

        {/* Schedule CTA — opens the Plan-my-month itinerary builder */}
        <Link
          href="/meetings?action=plan"
          className="hidden md:inline-flex items-center gap-1.5 shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider bg-brand-rust text-white hover:bg-brand-burnt transition"
        >
          <PlusIcon /> Schedule
        </Link>

        {/* Theme toggle (desktop) */}
        <ThemeToggle className="hidden md:inline-flex shrink-0 ml-2" />

        {/* User */}
        <div className="hidden lg:flex items-center gap-3 shrink-0 ml-2 pl-3 border-l border-brand-border/60">
          <div className="text-right leading-tight">
            <div className="text-xs font-semibold text-brand-textActive">{user.fullName}</div>
            <div className="text-[10px] text-brand-textMuted">
              {ROLE_LABEL[user.role] ?? user.role}
              {user.wardName && <span> · {user.wardName}</span>}
            </div>
          </div>
          <Link
            href="/account/password"
            title="Change password"
            className="shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-lg border border-brand-border text-brand-textMuted hover:text-brand-burnt hover:border-brand-burnt transition"
          >
            🔑
          </Link>
          <LogoutButton />
        </div>

        {/* Mobile toggle */}
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
          className="md:hidden ml-auto p-2 rounded-lg hover:bg-black/5 transition relative z-50"
        >
          {mobileOpen ? <CloseIcon /> : <BurgerIcon />}
        </button>
      </div>

      {/* Brand accent line — the full warm palette under the nav, every page. */}
      <div className="h-[3px] w-full bg-gradient-to-r from-brand-burnt via-brand-gold to-brand-teal" />

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            style={{ backgroundColor: '#FBF1E3' }}
            className="md:hidden fixed top-0 right-0 z-[70] w-[86%] max-w-[22rem] h-[100dvh] border-l border-brand-borderStrong shadow-2xl flex flex-col"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-brand-border">
              <BrandMark size={34} variant="compact" withName={true} />
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Close menu" className="p-2 rounded-lg hover:bg-black/5">
                <CloseIcon />
              </button>
            </div>

            <nav className="flex-1 overflow-y-auto py-2">
              <MobileLink href="/dashboard" label="Home" active={activeGroup === 'home'} onNav={() => setMobileOpen(false)} />

              {/* Wards accordion */}
              <MobileSection
                label="Wards"
                active={activeGroup === 'wards'}
                open={mobileSection === 'wards'}
                onToggle={() => setMobileSection((s) => (s === 'wards' ? null : 'wards'))}
              >
                <MobileLink href="/wards" label="All Wards" sub onNav={() => setMobileOpen(false)} />
                <MobileLink href="/wards/coverage" label="📊 Constituency Coverage" sub onNav={() => setMobileOpen(false)} />
                {wards.map((w) => (
                  <div key={w.id}>
                    <button
                      type="button"
                      onClick={() => setMobileWard((x) => (x === w.id ? null : w.id))}
                      className={[
                        'w-full flex items-center justify-between pl-7 pr-4 py-2.5 text-sm font-semibold transition',
                        mobileWard === w.id
                          ? 'bg-brand-burnt/10 text-brand-burnt'
                          : 'text-brand-textActive hover:bg-black/5',
                      ].join(' ')}
                    >
                      {w.name} <Caret open={mobileWard === w.id} />
                    </button>
                    {/* Second nesting level — its own tint, one step deeper. */}
                    {mobileWard === w.id && (
                      <div className="bg-brand-burnt/5 border-y border-brand-border/60">
                        {wardLinks(w.id).map((s) => (
                          <MobileLink key={s.href} href={s.href} label={s.label} deep onNav={() => setMobileOpen(false)} />
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </MobileSection>

              {/* Villages accordion (by ward → villages page) */}
              <MobileSection
                label="Villages"
                active={activeGroup === 'villages'}
                open={mobileSection === 'villages'}
                onToggle={() => setMobileSection((s) => (s === 'villages' ? null : 'villages'))}
              >
                <MobileLink href="/villages" label="🗺️ All-villages map" sub onNav={() => setMobileOpen(false)} />
                {villagesByWard.map(({ ward, villages: vs }) => (
                  <MobileLink
                    key={ward.id}
                    href={`/wards/${ward.id}/villages`}
                    label={`${ward.name} — ${vs.length} villages`}
                    sub
                    onNav={() => setMobileOpen(false)}
                  />
                ))}
                {/* Nyali — whole constituency (all wards joined) */}
                <MobileLink
                  href="/villages"
                  label={`🏛️ Nyali · whole constituency — ${villages.length} villages`}
                  sub
                  onNav={() => setMobileOpen(false)}
                />
              </MobileSection>

              <MobileLink href="/voters" label="Voters" active={activeGroup === 'voters'} onNav={() => setMobileOpen(false)} />

              {/* Polling Stations accordion (by ward) */}
              <MobileSection
                label="Polling Stations"
                active={false}
                open={mobileSection === 'stations'}
                onToggle={() => setMobileSection((s) => (s === 'stations' ? null : 'stations'))}
              >
                {stationLinks.map((s) => (
                  <MobileLink key={s.href} href={s.href} label={s.label} sub onNav={() => setMobileOpen(false)} />
                ))}
              </MobileSection>

              {/* Analysis accordion */}
              <MobileSection
                label="Analysis"
                active={activeGroup === 'analysis'}
                open={mobileSection === 'analysis'}
                onToggle={() => setMobileSection((s) => (s === 'analysis' ? null : 'analysis'))}
              >
                {ANALYSIS_LINKS.map((s) => (
                  <MobileLink key={s.href} href={s.href} label={s.label} sub onNav={() => setMobileOpen(false)} />
                ))}
              </MobileSection>

              {/* Team accordion */}
              <MobileSection
                label="Team"
                active={activeGroup === 'team'}
                open={mobileSection === 'team'}
                onToggle={() => setMobileSection((s) => (s === 'team' ? null : 'team'))}
              >
                {TEAM_LINKS.map((s) => (
                  <MobileLink key={s.href} href={s.href} label={s.label} sub onNav={() => setMobileOpen(false)} />
                ))}
              </MobileSection>

              {/* Import accordion (privileged) */}
              {privileged && (
                <MobileSection
                  label="Import & Audit"
                  active={activeGroup === 'import'}
                  open={mobileSection === 'import'}
                  onToggle={() => setMobileSection((s) => (s === 'import' ? null : 'import'))}
                >
                  {IMPORT_LINKS.map((s) => (
                    <MobileLink key={s.href} href={s.href} label={s.label} sub onNav={() => setMobileOpen(false)} />
                  ))}
                </MobileSection>
              )}

              <div className="border-t border-brand-border/60 mt-2 pt-2 px-4 space-y-2">
                <Link
                  href="/meetings?action=plan"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-brand-rust text-white text-xs font-bold uppercase tracking-wider hover:bg-brand-burnt transition"
                >
                  <PlusIcon /> Plan my month
                </Link>
                <div className="flex items-center justify-between px-1">
                  <span className="text-xs font-semibold text-brand-textBody">Appearance</span>
                  <ThemeToggle />
                </div>
              </div>
            </nav>

            <div className="border-t border-brand-border bg-brand-cardBgHeavy/40 px-4 py-3">
              <div className="text-sm font-semibold text-brand-textActive">{user.fullName}</div>
              <div className="text-[10px] text-brand-textMuted mb-2">
                {ROLE_LABEL[user.role] ?? user.role}
                {user.wardName && <span> · {user.wardName}</span>}
              </div>
              <Link
                href="/account/password"
                onClick={() => setMobileOpen(false)}
                className="mb-2 inline-flex items-center gap-2 rounded-lg border border-brand-border px-3 py-2 text-xs font-semibold text-brand-textActive hover:border-brand-burnt hover:text-brand-burnt transition"
              >
                🔑 Change password
              </Link>
              <LogoutButton />
            </div>
          </div>
        </>
      )}
    </header>
  );
}

// ── Desktop dropdown (simple link list) ─────────────────────────────────────
function DesktopDropdown({
  label,
  active,
  open,
  onToggle,
  links,
  pathname,
  topBtnClass,
}: {
  label: string;
  group: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  links: SubLink[];
  pathname: string;
  topBtnClass: string;
}) {
  return (
    <div className="relative">
      <button type="button" onClick={onToggle} aria-expanded={open} aria-haspopup="true" className={topBtnClass}>
        {label} <Caret open={open} />
      </button>
      {open && (
        <div className="absolute left-0 mt-2 z-50 w-56 rounded-xl border border-brand-borderStrong bg-brand-cardBg shadow-2xl p-1.5">
          {links.map((s) => {
            // Active when the link's base path matches the current path. Query-only
            // differences (?tab=…) aren't disambiguated here — the panel is short.
            const base = s.href.split('?')[0];
            const isActive = active && pathname === base;
            return (
              <Link
                key={s.href}
                href={s.href}
                className={[
                  'block px-3 py-2 rounded-lg text-sm transition',
                  isActive
                    ? 'bg-brand-burnt/20 text-brand-burnt font-semibold'
                    : 'text-brand-textBody hover:text-brand-textActive hover:bg-brand-burnt/15',
                ].join(' ')}
              >
                {s.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Mobile accordion section ────────────────────────────────────────────────
function MobileSection({
  label,
  active,
  open,
  onToggle,
  children,
}: {
  label: string;
  active: boolean;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={[
          'w-full flex items-center justify-between px-4 py-3 text-sm border-l-2 transition',
          open
            ? 'border-l-brand-burnt bg-brand-burnt/15 text-brand-burnt font-bold'
            : active
              ? 'border-l-brand-burnt text-brand-burnt font-semibold'
              : 'border-l-transparent text-brand-textBody hover:bg-black/5 hover:text-brand-textActive',
        ].join(' ')}
      >
        {label} <Caret open={open} />
      </button>
      {/* Open panel gets a clearly different background than the cream drawer so
          the dropdown's items read as one block belonging to the header above. */}
      {open && (
        <div className="bg-white border-y border-brand-border border-l-2 border-l-brand-burnt shadow-inner">
          {children}
        </div>
      )}
    </div>
  );
}

function MobileLink({
  href,
  label,
  active,
  sub,
  deep,
  onNav,
}: {
  href: string;
  label: string;
  active?: boolean;
  sub?: boolean;
  deep?: boolean;
  onNav: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNav}
      className={[
        'block py-2.5 text-sm border-l-2 transition',
        deep ? 'pl-11 pr-4 text-[13px]' : sub ? 'pl-7 pr-4' : 'px-4',
        active
          ? 'border-l-brand-burnt bg-brand-burnt/15 text-brand-burnt font-semibold'
          : 'border-l-transparent text-brand-textMuted hover:bg-black/5 hover:text-brand-textActive',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}

function Caret({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`transition-transform ${open ? 'rotate-180' : ''}`}
    >
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function BurgerIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden className="text-brand-textActive">
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden className="text-brand-textActive">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}
