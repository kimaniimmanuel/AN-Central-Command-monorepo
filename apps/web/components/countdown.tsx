'use client';

import { useEffect, useState } from 'react';

// Election Countdown — HERO STRIP (SRS FR-090).
//
// Placement: full-width strip immediately below the navbar (set in app/(authed)/layout.tsx).
// Style:    extremely loud — huge boxed digits, urgency-tiered colour, persistent pulse.
//
// Calendar-month arithmetic for the months unit (walks the calendar so "1 month"
// means "until same day-of-month next month", not "30.44 days").
//
// AC-090.2 — election date configurable via NEXT_PUBLIC_ELECTION_DATE env var.
// AC-090.3 — when the date passes, displays "Election day" then "N days since election".

const DEFAULT_ELECTION_DATE = '2027-08-09T03:00:00.000Z';

const ELECTION_DATE = new Date(
  process.env.NEXT_PUBLIC_ELECTION_DATE ?? DEFAULT_ELECTION_DATE,
);

interface Parts {
  months: number;
  days: number;
  hours: number;
  mins: number;
  secs: number;
  passed: boolean;
}

function diffParts(now: Date): Parts {
  const target = ELECTION_DATE;
  const passed = target.getTime() <= now.getTime();

  if (passed) {
    const abs = Math.abs(target.getTime() - now.getTime());
    return {
      months: 0,
      days: Math.floor(abs / 86_400_000),
      hours: Math.floor((abs / 3_600_000) % 24),
      mins: Math.floor((abs / 60_000) % 60),
      secs: Math.floor((abs / 1_000) % 60),
      passed: true,
    };
  }

  let months =
    (target.getUTCFullYear() - now.getUTCFullYear()) * 12 +
    (target.getUTCMonth() - now.getUTCMonth());
  const anchor = new Date(now);
  anchor.setUTCMonth(anchor.getUTCMonth() + months);
  if (anchor.getTime() > target.getTime()) {
    months -= 1;
    anchor.setUTCMonth(anchor.getUTCMonth() - 1);
  }
  const remainder = target.getTime() - anchor.getTime();
  return {
    months,
    days: Math.floor(remainder / 86_400_000),
    hours: Math.floor((remainder / 3_600_000) % 24),
    mins: Math.floor((remainder / 60_000) % 60),
    secs: Math.floor((remainder / 1_000) % 60),
    passed: false,
  };
}

export function Countdown() {
  const [parts, setParts] = useState<Parts | null>(null);

  useEffect(() => {
    setParts(diffParts(new Date()));
    const id = setInterval(() => setParts(diffParts(new Date())), 1000);
    return () => clearInterval(id);
  }, []);

  if (!parts) {
    return (
      <div className="w-full border-b border-brand-border bg-brand-cardBg/60 py-2 flex items-center justify-center gap-3">
        <span className="text-[11px] uppercase tracking-[0.2em] text-brand-textMuted font-bold">
          Election countdown
        </span>
      </div>
    );
  }

  if (parts.passed) {
    if (parts.days === 0 && parts.hours < 24) {
      return (
        <div className="w-full border-b border-brand-teal/40 bg-brand-teal/10 py-2.5 flex items-center justify-center gap-3">
          <span className="w-2.5 h-2.5 rounded-full bg-brand-teal animate-pulse" />
          <span className="text-base md:text-lg font-extrabold uppercase tracking-[0.2em] text-brand-teal">
            Election day
          </span>
        </div>
      );
    }
    return (
      <div className="w-full border-b border-brand-border bg-brand-cardBg/40 py-2 text-center">
        <span className="text-sm font-bold text-brand-textActive">
          {parts.days} day{parts.days === 1 ? '' : 's'} since election
        </span>
      </div>
    );
  }

  const tier =
    parts.months === 0 && parts.days < 7
      ? 'critical'
      : parts.months === 0 && parts.days < 30
        ? 'warning'
        : parts.months < 6
          ? 'active'
          : 'calm';

  // BOLD multi-colour countdown — each unit gets its own retro-sunset colour for a
  // vibrant, campaign-rally feel. Five solid-filled cells in a fixed 5-col grid;
  // digit size via clamp() so it's HUGE on desktop and fits a phone with no overflow.
  // When the race gets close (<30 days) every cell goes rust + pulses for urgency.
  const urgent = tier === 'warning' || tier === 'critical';
  const CELLS: Array<{ value: number; unit: string; fill: string; text: string; pad?: boolean; live?: boolean }> = [
    { value: parts.months, unit: 'Months',  fill: 'bg-brand-burnt', text: 'text-white' },
    { value: parts.days,   unit: 'Days',     fill: 'bg-brand-gold',  text: 'text-black' },
    { value: parts.hours,  unit: 'Hours',    fill: 'bg-brand-teal',  text: 'text-white', pad: true },
    { value: parts.mins,   unit: 'Minutes',  fill: 'bg-brand-rust',  text: 'text-white', pad: true },
    { value: parts.secs,   unit: 'Seconds',  fill: 'bg-brand-brown', text: 'text-white', pad: true, live: true },
  ];

  return (
    <div className="w-full border-b border-brand-border bg-gradient-to-r from-brand-burnt/10 via-brand-gold/10 to-brand-teal/10">
      {/* Phone: slim one-line ticker — the big grid eats a third of a small screen
          on EVERY page, so mobile gets months + days only, in one compact strip. */}
      <div className="md:hidden flex items-center justify-center gap-2 px-3 py-1.5">
        <span className={`w-1.5 h-1.5 rounded-full ${urgent ? 'bg-brand-rust' : 'bg-brand-burnt'} animate-pulse`} />
        <span className="text-[11px] font-black uppercase tracking-[0.14em] text-brand-textActive whitespace-nowrap">
          {parts.months > 0 && <>{parts.months} mo · </>}
          {parts.days} d{parts.months === 0 && <> · {String(parts.hours).padStart(2, '0')}:{String(parts.mins).padStart(2, '0')}</>} to election
        </span>
        <span className="text-[10px] font-semibold text-brand-textMuted whitespace-nowrap">9 Aug 2027</span>
      </div>

      {/* Desktop / tablet: the full hero grid. */}
      <div className="hidden md:block max-w-4xl mx-auto px-2 sm:px-4 py-3 md:py-5">
        {/* Eyebrow */}
        <div className="flex items-center justify-center gap-2 mb-2 md:mb-3">
          <span className="w-2 h-2 rounded-full bg-brand-burnt animate-pulse" />
          <span
            className="font-black uppercase tracking-[0.18em] text-brand-textActive text-center"
            style={{ fontSize: 'clamp(0.6rem, 2.2vw, 0.85rem)' }}
          >
            Election Countdown · 9 Aug 2027
          </span>
          <span className="w-2 h-2 rounded-full bg-brand-teal animate-pulse" />
        </div>

        {/* Five big cells (incl. seconds) — fixed 5-col grid never overflows. */}
        <div className="grid grid-cols-5 gap-1.5 sm:gap-2.5 md:gap-3">
          {CELLS.map((c) => (
            <Cell
              key={c.unit}
              value={c.value}
              unit={c.unit}
              fill={urgent ? 'bg-brand-rust' : c.fill}
              text={urgent ? 'text-white' : c.text}
              pad={c.pad}
              live={c.live || urgent}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function Cell({
  value,
  unit,
  fill,
  text,
  pad,
  live,
}: {
  value: number;
  unit: string;
  fill: string;
  text: string;
  pad?: boolean;
  live?: boolean;
}) {
  const str = pad ? String(value).padStart(2, '0') : String(value);
  const subtle = text === 'text-black' ? 'text-black/60' : 'text-white/80';
  return (
    <div
      className={`min-w-0 rounded-xl md:rounded-2xl ${fill} shadow-lg flex flex-col items-center justify-center px-0.5 py-2 sm:py-3 md:py-4`}
    >
      <span
        className={`font-black tabular-nums leading-none ${text} ${live ? 'animate-pulse' : ''}`}
        style={{ fontSize: 'clamp(1.5rem, 8vw, 4.5rem)' }}
      >
        {str}
      </span>
      <span
        className={`font-bold uppercase tracking-wider ${subtle} mt-1 md:mt-2`}
        style={{ fontSize: 'clamp(0.5rem, 1.7vw, 0.72rem)' }}
      >
        {unit}
      </span>
    </div>
  );
}
