'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// A clear, physical-looking "Back" button shown on deep pages (top-left).
// It links to the PARENT route (one level up), and names the destination when we
// know it — e.g. "← Back to Wards" — so a first-time user always has an obvious,
// tappable way out. Hidden on the top-level destinations, where the top nav and
// mobile bottom bar already cover it.

const SECTION: Record<string, string> = {
  '/wards': 'Wards',
  '/polling-stations': 'Polling Centres',
  '/voters': 'Voters',
  '/team': 'Team',
  '/villages': 'Villages',
  '/analytics': 'Analysis',
  '/community': 'Community',
  '/issues': 'Issues',
  '/meetings': 'Meetings',
  '/data-import': 'Data Import',
  '/audit': 'Audit Logs',
  '/supporters': 'Supporters',
};

export function BackButton() {
  const pathname = usePathname() ?? '';
  const segs = pathname.split('/').filter(Boolean);

  // On the home page itself, nothing to show.
  if (segs.length === 0 || pathname === '/dashboard' || pathname === '/') return null;

  // Compact on phones (still ≥40px tap target), roomier on desktop.
  const cls =
    'inline-flex items-center gap-1.5 sm:gap-2 min-h-[40px] sm:min-h-[44px] rounded-lg border border-brand-borderStrong bg-brand-cardBg px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-brand-textActive shadow-sm hover:border-brand-burnt hover:text-brand-burnt hover:bg-brand-burnt/5 active:scale-[0.98] transition';

  // Top-level section page (one segment, e.g. /team, /voters) → a clear Home button.
  if (segs.length < 2) {
    return (
      <Link href="/dashboard" className={cls}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M3 10.5 12 3l9 7.5M5 9.5V21h5v-6h4v6h5V9.5" />
        </svg>
        Home
      </Link>
    );
  }

  // Deeper page → "Back to <parent section>".
  const parent = '/' + segs.slice(0, -1).join('/');
  const named = SECTION[parent] ?? null;
  const label = named ? `Back to ${named}` : 'Back';

  return (
    <Link href={parent} className={cls}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M19 12H5M12 19l-7-7 7-7" />
      </svg>
      {/* Phones: just "Back" — the destination name is desktop detail. */}
      <span className="sm:hidden">Back</span>
      <span className="hidden sm:inline">{label}</span>
    </Link>
  );
}
