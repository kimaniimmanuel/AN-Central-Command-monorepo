import Link from 'next/link';
import { desc } from 'drizzle-orm';
import { whatsappIntake } from '@an/db';
import { getServerAuthOrRedirect } from '@/lib/server-auth';
import { withRlsTx } from '@/lib/api';
import { Pie } from '@/components/charts/pie';
import { HorizontalBarChart } from '@/components/charts/horizontal-bar';
import {
  OVERVIEW,
  EXECUTIVE_BRIEF,
  ALERTS,
  PRAISE_THEMES,
  COMPLAINT_THEMES,
  WARD_MOOD,
  VOICES,
  NETWORK_NOTES,
  OPPONENTS,
  OUR_SHARE_OF_VOICE,
  NATIONAL_THREADS,
  SOURCE_STATUS,
  PLATFORM_REPORTS,
  REPORT_SCHEDULE,
  MONITORED_FIGURES,
  type Sentiment,
  type Source,
} from '@/data/intelligence-demo';
import { ReportToolbar } from '@/components/report-toolbar';
import { isWhatsAppEnabled } from '@/lib/whatsapp';

// /reports — Intelligence & Reports hub.
//
// One place where Alfayo + admins read the pulse: the debate about Alfayo, where
// people praise vs complain, what the public and our own network (members,
// Warembo, Flames, community leaders, chiefs) are saying, and how opponents are
// tracking. Tabs via ?tab= (server-rendered, same pattern as /analytics).
//
// ⚠️  Runs on DEMO data (apps/web/data/intelligence-demo.ts) until real ingestion
//     is wired. The banner below states this plainly so no one mistakes the
//     placeholder feed for live intelligence.

export const runtime = 'nodejs';

type Tab = 'daily' | 'inbox' | 'overview' | 'debate' | 'voices' | 'network' | 'opponents' | 'sources';
const TABS: { key: Tab; label: string }[] = [
  { key: 'daily',     label: 'Daily Report' },
  { key: 'inbox',     label: 'WhatsApp Inbox' },
  { key: 'overview',  label: 'Overview' },
  { key: 'debate',    label: 'The Debate' },
  { key: 'voices',    label: 'Voices' },
  { key: 'network',   label: 'Our Network' },
  { key: 'opponents', label: 'Opponents' },
  { key: 'sources',   label: 'Sources' },
];

const C = {
  praise:    '#10b981',
  neutral:   '#64748b',
  criticism: '#dc2626',
  ours:      '#ff6600',
  teal:      '#025e73',
  sky:       '#00ccff',
};

const SENT_STYLE: Record<Sentiment, { dot: string; text: string; label: string }> = {
  praise:    { dot: 'bg-emerald-500', text: 'text-emerald-600', label: 'Praise' },
  neutral:   { dot: 'bg-slate-400',   text: 'text-slate-500',   label: 'Neutral' },
  criticism: { dot: 'bg-red-500',     text: 'text-red-600',     label: 'Criticism' },
};

const SOURCE_ICON: Record<Source, string> = {
  whatsapp: '🟢', facebook: '🔵', tiktok: '⚫', instagram: '🟣', x: '⚪', field: '📍',
};

interface PageProps {
  searchParams: { tab?: string };
}

export default async function ReportsPage({ searchParams }: PageProps) {
  const claims = await getServerAuthOrRedirect();
  const tab: Tab = (TABS.some((t) => t.key === searchParams.tab) ? searchParams.tab : 'daily') as Tab;

  // Live WhatsApp member reports — only queried when the Inbox tab is open.
  const inboxRows = tab === 'inbox'
    ? await withRlsTx(claims, async (tx) =>
        tx.select().from(whatsappIntake).orderBy(desc(whatsappIntake.receivedAt)).limit(50))
    : [];
  // Server-stamped "generated" time — replaced by the real job's timestamp once
  // the nightly generation writes to storage.
  const generatedAt = new Date().toLocaleString('en-GB', {
    timeZone: 'Africa/Nairobi', dateStyle: 'medium', timeStyle: 'short',
  });

  const s = OVERVIEW.sentiment;
  const totalSent = s.praise + s.neutral + s.criticism;
  const praisePct = totalSent ? Math.round((s.praise / totalSent) * 100) : 0;

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Header */}
      <header className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-brand-teal via-brand-deepBlue to-brand-burnt p-4 sm:p-6 shadow-xl">
        <div className="absolute -top-16 -right-10 w-56 h-56 rounded-full bg-brand-skyBlue/20 blur-3xl pointer-events-none" />
        <div className="relative space-y-1">
          <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-white/80">
            Intelligence
          </div>
          <h1 className="text-xl sm:text-3xl font-black text-white uppercase tracking-tight">
            Reports &amp; Listening
          </h1>
          <p className="hidden sm:block text-sm text-white/90 font-semibold max-w-3xl">
            The debate on Alfayo — praise, complaints, what people and our network are saying, and how opponents track.
          </p>
        </div>
      </header>

      {/* Honest demo banner */}
      <div className="rounded-xl border border-amber-400/50 bg-amber-400/10 px-4 py-3 flex items-start gap-2">
        <span className="text-lg leading-none">⚠️</span>
        <p className="text-xs sm:text-sm text-amber-700 font-semibold leading-relaxed">
          Preview on sample data. No quote here is a real person&apos;s statement — this builds the surface so it&apos;s
          ready the moment real sources connect. See the <Link href="/reports?tab=sources" className="underline">Sources</Link> tab
          for what&apos;s connected.
        </p>
      </div>

      {/* Tabs */}
      <nav className="flex gap-1.5 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Link
              key={t.key}
              href={`/reports?tab=${t.key}`}
              className={[
                'shrink-0 whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-semibold transition',
                active
                  ? 'bg-brand-burnt text-white shadow'
                  : 'bg-brand-cardBg border border-brand-border text-brand-textBody hover:text-brand-textActive hover:border-brand-burnt',
              ].join(' ')}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>

      {tab === 'daily'     && <DailyReport generatedAt={generatedAt} />}
      {tab === 'inbox'     && <Inbox rows={inboxRows} whatsappLive={isWhatsAppEnabled()} />}
      {tab === 'overview'  && <Overview praisePct={praisePct} />}
      {tab === 'debate'    && <Debate />}
      {tab === 'voices'    && <Voices />}
      {tab === 'network'   && <Network />}
      {tab === 'opponents' && <Opponents />}
      {tab === 'sources'   && <Sources whatsappLive={isWhatsAppEnabled()} />}
    </div>
  );
}

// ── WhatsApp Inbox (live member reports) ────────────────────────────────────
interface InboxRow {
  id: string;
  fromNumber: string;
  senderName: string | null;
  body: string | null;
  msgType: string;
  receivedAt: Date;
}

function Inbox({ rows, whatsappLive }: { rows: InboxRow[]; whatsappLive: boolean }) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-brand-teal/40 bg-brand-teal/5 px-4 py-3 text-xs sm:text-sm text-brand-textBody">
        Messages your members send to the campaign WhatsApp number land here — the raw material
        for the daily report. {whatsappLive
          ? 'WhatsApp is connected; new messages appear automatically.'
          : 'WhatsApp isn’t connected yet — this fills once the Cloud API keys + webhook are live (see the Sources tab).'}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-border bg-brand-cardBgHeavy/40 px-4 py-10 text-center">
          <div className="text-3xl mb-2">📥</div>
          <p className="text-sm font-semibold text-brand-textActive">No member reports yet</p>
          <p className="text-xs text-brand-textMuted mt-1 max-w-md mx-auto">
            When a member messages the campaign number, it shows here with their name, number, and
            what they said — ready to roll into the nightly report.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {rows.map((m) => (
            <div key={m.id} className="rounded-lg border border-brand-border bg-brand-darkBg/30 p-3">
              <div className="flex items-center gap-2 mb-1 text-xs flex-wrap">
                <span>🟢</span>
                <span className="font-semibold text-brand-textActive">{m.senderName ?? 'Unknown'}</span>
                <span className="text-brand-textMuted tabular-nums">+{m.fromNumber}</span>
                {m.msgType !== 'text' && (
                  <span className="rounded bg-brand-burnt/15 text-brand-burnt px-1.5 py-0.5 text-[10px] font-bold uppercase">{m.msgType}</span>
                )}
                <span className="text-brand-textMuted ml-auto">
                  {m.receivedAt.toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
              <p className="text-sm text-brand-textBody">{m.body ?? <span className="italic text-brand-textMuted">(non-text message)</span>}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Daily Report (per platform, ranked case) ────────────────────────────────
const WEIGHT_STYLE = {
  high:   { label: 'HIGH',   cls: 'bg-red-500/15 text-red-600' },
  medium: { label: 'MEDIUM', cls: 'bg-amber-500/15 text-amber-600' },
  low:    { label: 'LOW',    cls: 'bg-slate-500/15 text-slate-500' },
} as const;

function DailyReport({ generatedAt }: { generatedAt: string }) {
  return (
    <div className="space-y-5">
      {/* Schedule + actions toolbar (client) */}
      <ReportToolbar scheduleLabel={REPORT_SCHEDULE.label} generatedAt={generatedAt} />

      {/* Notify note — delivery is in-app + notify; the push channel is pending. */}
      <div className="rounded-xl border border-brand-teal/40 bg-brand-teal/5 px-4 py-2.5 text-xs sm:text-sm text-brand-textBody flex items-start gap-2">
        <span>🔔</span>
        <span>
          When the nightly report is ready, Alfayo &amp; admins are notified in-app. External push
          (WhatsApp/SMS/email) turns on once a messaging channel is connected — see the{' '}
          <Link href="/reports?tab=sources" className="underline">Sources</Link> tab.
        </span>
      </div>

      {PLATFORM_REPORTS.map((r) => {
        const tot = r.sentiment.praise + r.sentiment.neutral + r.sentiment.criticism;
        const praisePct = tot ? Math.round((r.sentiment.praise / tot) * 100) : 0;
        return (
          <div key={r.platform} className="rounded-xl border border-brand-border bg-brand-cardBg overflow-hidden">
            {/* Platform header */}
            <div className="flex items-start gap-3 border-b border-brand-border p-4">
              <span className="text-2xl leading-none">{SOURCE_ICON[r.platform]}</span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-black text-brand-textActive">{r.label}</h3>
                  <span className="text-[11px] text-brand-textMuted tabular-nums">{r.mentions.toLocaleString()} mentions</span>
                </div>
                <p className="text-sm text-brand-textBody mt-0.5">{r.headline}</p>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-lg font-black text-emerald-600 tabular-nums leading-none">{praisePct}%</div>
                <div className="text-[10px] uppercase tracking-wider text-brand-textMuted">praise</div>
              </div>
            </div>
            {/* Ranked case points */}
            <ol className="divide-y divide-brand-border/60">
              {r.casePoints.map((c) => {
                const w = WEIGHT_STYLE[c.weight];
                const st = SENT_STYLE[c.sentiment];
                return (
                  <li key={c.rank} className="flex items-start gap-3 p-4">
                    <span className="shrink-0 flex h-6 w-6 items-center justify-center rounded-full bg-brand-burnt/15 text-brand-burnt text-xs font-black">{c.rank}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-bold text-brand-textActive">{c.point}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${w.cls}`}>{w.label}</span>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${st.text}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />{st.label}
                        </span>
                      </div>
                      {/* Wordy detail — shown on screen too, but this is what the PDF leans on. */}
                      <p className="mt-1 text-xs text-brand-textBody leading-relaxed">{c.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          </div>
        );
      })}
    </div>
  );
}

// ── Overview ────────────────────────────────────────────────────────────────
function Overview({ praisePct }: { praisePct: number }) {
  const s = OVERVIEW.sentiment;
  return (
    <div className="space-y-5">
      {/* KPI row */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Mentions" value={OVERVIEW.totalMentions.toLocaleString()} hint={OVERVIEW.windowLabel} trend={OVERVIEW.trend.mentions} />
        <Kpi label="Estimated reach" value={`${(OVERVIEW.reach / 1000).toFixed(0)}k`} hint="People reached" />
        <Kpi label="Praise" value={`${praisePct}%`} hint="Net-positive tone" trend={OVERVIEW.trend.praise} good />
        <Kpi label="Criticism" value={`${Math.round((s.criticism / (s.praise + s.neutral + s.criticism)) * 100)}%`} hint="To address" trend={OVERVIEW.trend.criticism} />
      </section>

      <div className="grid lg:grid-cols-3 gap-5">
        {/* AI brief */}
        <Panel title="Executive brief" subtitle="AI summary of the week" className="lg:col-span-2">
          <ul className="space-y-2.5">
            {EXECUTIVE_BRIEF.map((line, i) => (
              <li key={i} className="flex gap-2 text-sm text-brand-textBody leading-relaxed">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-brand-burnt" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Sentiment donut */}
        <Panel title="Overall tone" subtitle="Praise · Neutral · Criticism">
          <div className="flex justify-center py-2">
            <Pie
              size={172}
              donut
              centerText={`${praisePct}%`}
              centerSubText="Praise"
              data={[
                { label: 'Praise', value: s.praise, color: C.praise },
                { label: 'Neutral', value: s.neutral, color: C.neutral },
                { label: 'Criticism', value: s.criticism, color: C.criticism },
              ]}
            />
          </div>
        </Panel>
      </div>

      {/* Alerts */}
      <Panel title="Needs attention" subtitle="Time-sensitive items">
        <div className="space-y-2">
          {ALERTS.map((a) => (
            <div key={a.id} className="flex items-start gap-3 rounded-lg border border-brand-border bg-brand-darkBg/30 p-3">
              <span className={[
                'shrink-0 mt-0.5 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
                a.level === 'high' ? 'bg-red-500/15 text-red-600'
                  : a.level === 'medium' ? 'bg-amber-500/15 text-amber-600'
                  : 'bg-sky-500/15 text-sky-600',
              ].join(' ')}>{a.level}</span>
              <div className="min-w-0">
                <div className="text-sm font-bold text-brand-textActive">{a.title}</div>
                <div className="text-xs text-brand-textBody">{a.detail}</div>
                <div className="text-[11px] text-brand-textMuted mt-0.5">{a.where} · {a.when}</div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ── The Debate ──────────────────────────────────────────────────────────────
function Debate() {
  const maxTheme = Math.max(...PRAISE_THEMES.map((t) => t.volume), ...COMPLAINT_THEMES.map((t) => t.volume));
  return (
    <div className="space-y-5">
      <div className="grid md:grid-cols-2 gap-5">
        <Panel title="👍 What people praise" subtitle="Positive themes by volume">
          <ThemeBars themes={PRAISE_THEMES} max={maxTheme} color={C.praise} />
        </Panel>
        <Panel title="👎 What people complain about" subtitle="Negative themes by volume">
          <ThemeBars themes={COMPLAINT_THEMES} max={maxTheme} color={C.criticism} />
        </Panel>
      </div>

      <Panel title="Where the mood is hottest" subtitle="Praise vs criticism per ward">
        <div className="space-y-3">
          {WARD_MOOD.map((w) => {
            const total = w.praise + w.criticism;
            const praisePct = total ? (w.praise / total) * 100 : 0;
            return (
              <div key={w.ward}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-semibold text-brand-textActive">{w.ward}</span>
                  <span className="tabular-nums text-brand-textMuted">
                    <span className="text-emerald-600 font-bold">{w.praise}%</span> · <span className="text-red-600 font-bold">{w.criticism}%</span>
                  </span>
                </div>
                <div className="flex h-3 rounded-full overflow-hidden border border-brand-border/60">
                  <div className="h-full bg-emerald-500" style={{ width: `${praisePct}%` }} />
                  <div className="h-full bg-red-500" style={{ width: `${100 - praisePct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 text-xs text-brand-textMuted">
          Wards where the red bar is largest are the priority for a response push.
        </p>
      </Panel>

      <Panel title="🇰🇪 National threads touching Mombasa" subtitle="Watch for spillover">
        <div className="space-y-2">
          {NATIONAL_THREADS.map((t) => (
            <div key={t.id} className="flex items-start gap-3 rounded-lg border border-brand-border bg-brand-darkBg/30 p-3">
              <HeatBadge heat={t.heat} />
              <div>
                <div className="text-sm font-bold text-brand-textActive">{t.topic}</div>
                <div className="text-xs text-brand-textBody">{t.note}</div>
              </div>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

// ── Voices ──────────────────────────────────────────────────────────────────
function Voices() {
  return (
    <Panel title="What people are saying" subtitle="Sample public mentions (anonymized)">
      <div className="space-y-2.5">
        {VOICES.map((v) => {
          const st = SENT_STYLE[v.sentiment];
          return (
            <div key={v.id} className="rounded-lg border border-brand-border bg-brand-darkBg/30 p-3">
              <div className="flex items-center gap-2 mb-1.5 text-xs">
                <span>{SOURCE_ICON[v.source]}</span>
                <span className="font-semibold text-brand-textActive">{v.speaker}</span>
                <span className={`inline-flex items-center gap-1 ${st.text} font-bold`}>
                  <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />{st.label}
                </span>
                <span className="text-brand-textMuted ml-auto">{v.topic} · {v.when}</span>
              </div>
              <p className="text-sm text-brand-textBody">&ldquo;{v.text}&rdquo;</p>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

// ── Our Network ─────────────────────────────────────────────────────────────
function Network() {
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-brand-teal/40 bg-brand-teal/5 px-4 py-3">
        <p className="text-xs sm:text-sm text-brand-textBody">
          What our own people report from the ground — <strong>members, Warembo, Alfayo Flames, community leaders and chiefs</strong>.
          Fed by consenting team members through the in-app intake (not by scraping anyone&apos;s private chats).
        </p>
      </div>
      <Panel title="Field reports" subtitle="From our network">
        <div className="space-y-2.5">
          {NETWORK_NOTES.map((n) => {
            const st = SENT_STYLE[n.mood];
            return (
              <div key={n.id} className="rounded-lg border border-brand-border bg-brand-darkBg/30 p-3">
                <div className="flex items-center gap-2 mb-1 text-xs flex-wrap">
                  <span className="rounded-md bg-brand-burnt/15 text-brand-burnt px-2 py-0.5 font-bold">{n.circle}</span>
                  <span className="text-brand-textMuted">{n.area}</span>
                  <span className={`inline-flex items-center gap-1 ${st.text} font-bold`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${st.dot}`} />{st.label}
                  </span>
                  <span className="text-brand-textMuted ml-auto">{n.when}</span>
                </div>
                <p className="text-sm text-brand-textBody">{n.note}</p>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

// ── Opponents ───────────────────────────────────────────────────────────────
function Opponents() {
  const bars = [
    { label: 'Alfayo Nelson', value: OUR_SHARE_OF_VOICE, color: C.ours, highlight: true, sublabel: 'us' },
    ...OPPONENTS.map((o) => ({ label: `${o.name} (${o.tag})`, value: o.shareOfVoice, color: C.teal })),
  ];
  return (
    <div className="space-y-5">
      <Panel title="Share of conversation" subtitle="Who owns the debate this week">
        <HorizontalBarChart bars={bars} max={100} />
      </Panel>

      <div className="grid md:grid-cols-3 gap-4">
        {OPPONENTS.map((o) => {
          const tot = o.sentiment.praise + o.sentiment.neutral + o.sentiment.criticism;
          const figure = MONITORED_FIGURES.find((f) => f.id === o.id);
          const fb = figure?.accounts.filter((a) => a.platform === 'facebook') ?? [];
          const tk = figure?.accounts.filter((a) => a.platform === 'tiktok') ?? [];
          return (
            <div key={o.id} className="rounded-xl border border-brand-border bg-brand-cardBg p-4">
              <div className="flex items-center justify-between">
                <div className="text-sm font-bold text-brand-textActive">{o.name}</div>
                <span className="rounded-md bg-brand-deepBlue/15 text-brand-deepBlue px-2 py-0.5 text-[10px] font-bold uppercase">{o.tag}</span>
              </div>
              <div className="mt-1 text-xs text-brand-textMuted">{o.shareOfVoice}% share of voice</div>
              <div className="mt-3 flex h-2.5 rounded-full overflow-hidden border border-brand-border/60">
                <div className="h-full bg-emerald-500" style={{ width: `${(o.sentiment.praise / tot) * 100}%` }} />
                <div className="h-full bg-slate-400" style={{ width: `${(o.sentiment.neutral / tot) * 100}%` }} />
                <div className="h-full bg-red-500" style={{ width: `${(o.sentiment.criticism / tot) * 100}%` }} />
              </div>
              <p className="mt-3 text-xs text-brand-textBody">{o.topLine}</p>

              {/* Per-platform account links — where they're active */}
              <div className="mt-3 flex flex-wrap gap-1.5">
                {fb.map((a, i) => (
                  <a key={`fb${i}`} href={a.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-blue-500/10 text-blue-600 px-2 py-1 text-[11px] font-semibold hover:bg-blue-500/20 transition">
                    🔵 Facebook ↗
                  </a>
                ))}
                {tk.map((a, i) => (
                  <a key={`tk${i}`} href={a.url} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-md bg-black/10 text-brand-textActive px-2 py-1 text-[11px] font-semibold hover:bg-black/20 transition">
                    ⚫ TikTok ↗
                  </a>
                ))}
              </div>
              {figure?.note && (
                <p className="mt-2 text-[11px] text-amber-600 font-medium">{figure.note}</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Sources ─────────────────────────────────────────────────────────────────
function Sources({ whatsappLive }: { whatsappLive: boolean }) {
  const STATUS_STYLE: Record<string, { label: string; cls: string }> = {
    connected:     { label: 'Connected',     cls: 'bg-emerald-500/15 text-emerald-600' },
    pending:       { label: 'Ready to connect', cls: 'bg-amber-500/15 text-amber-600' },
    not_connected: { label: 'Not connected', cls: 'bg-slate-500/15 text-slate-500' },
    restricted:    { label: 'Restricted',    cls: 'bg-red-500/15 text-red-600' },
  };
  // WhatsApp row reflects the live env config: once the Cloud API keys are set,
  // it flips to "connected". Others stay driven by the static status for now.
  const rows = SOURCE_STATUS.map((s) =>
    s.source === 'whatsapp'
      ? {
          ...s,
          status: whatsappLive ? ('connected' as const) : ('pending' as const),
          note: whatsappLive
            ? 'Cloud API configured — campaign number can receive member reports and send alerts. (Does not read group chats.) Point the Meta webhook at /api/whatsapp/webhook.'
            : 'Ready to wire: add the WhatsApp Cloud API keys to the environment, then register the webhook at /api/whatsapp/webhook. Receives member reports + sends alerts; does not read group chats.',
        }
      : s,
  );
  return (
    <div className="space-y-5">
      <Panel title="Data sources" subtitle="What feeds these reports">
        <div className="space-y-2.5">
          {rows.map((s) => {
            const st = STATUS_STYLE[s.status];
            return (
              <div key={s.source} className="flex items-start gap-3 rounded-lg border border-brand-border bg-brand-darkBg/30 p-3">
                <span className="text-xl leading-none">{SOURCE_ICON[s.source]}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-brand-textActive">{s.label}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${st.cls}`}>{st.label}</span>
                  </div>
                  <p className="text-xs text-brand-textBody mt-0.5">{s.note}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <Panel title="How to go live" subtitle="The path from demo to real data">
        <ol className="space-y-2 text-sm text-brand-textBody list-decimal list-inside">
          <li>Connect Alfayo&apos;s <strong>own</strong> Facebook / Instagram / TikTok via tokens he authorizes — real comments, reactions, feedback.</li>
          <li>Stand up a <strong>campaign WhatsApp number</strong> + an in-app intake for consenting members to report group happenings.</li>
          <li>For opponents &amp; general mentions, add manual/periodic collection or a paid listening tool.</li>
          <li>Wire the Claude API to turn collected text into the weekly executive brief automatically.</li>
        </ol>
      </Panel>
    </div>
  );
}

// ── Shared bits ─────────────────────────────────────────────────────────────
function ThemeBars({ themes, max, color }: { themes: { label: string; volume: number }[]; max: number; color: string }) {
  return (
    <div className="space-y-2.5">
      {themes.map((t) => (
        <div key={t.label}>
          <div className="flex justify-between text-sm mb-1">
            <span className="text-brand-textActive font-medium">{t.label}</span>
            <span className="tabular-nums text-brand-textMuted">{t.volume}</span>
          </div>
          <div className="h-2.5 rounded-full bg-black/10 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(t.volume / max) * 100}%`, background: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function HeatBadge({ heat }: { heat: 'rising' | 'steady' | 'cooling' }) {
  const map = {
    rising:  { t: '↑ Rising', c: 'bg-red-500/15 text-red-600' },
    steady:  { t: '→ Steady', c: 'bg-slate-500/15 text-slate-500' },
    cooling: { t: '↓ Cooling', c: 'bg-sky-500/15 text-sky-600' },
  }[heat];
  return <span className={`shrink-0 rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${map.c}`}>{map.t}</span>;
}

function Kpi({ label, value, hint, trend, good }: { label: string; value: string; hint: string; trend?: number; good?: boolean }) {
  const up = (trend ?? 0) >= 0;
  const trendGood = good ? up : !up;
  return (
    <div className="rounded-xl border border-brand-border bg-brand-cardBg p-4">
      <div className="text-[11px] font-bold uppercase tracking-wider text-brand-textMuted">{label}</div>
      <div className="mt-1 text-2xl font-black text-brand-textActive tabular-nums">{value}</div>
      <div className="mt-0.5 flex items-center gap-1.5 text-[11px]">
        <span className="text-brand-textMuted">{hint}</span>
        {trend !== undefined && (
          <span className={`font-bold ${trendGood ? 'text-emerald-600' : 'text-red-600'}`}>
            {up ? '▲' : '▼'} {Math.abs(trend)}%
          </span>
        )}
      </div>
    </div>
  );
}

function Panel({ children, title, subtitle, className }: { children: React.ReactNode; title: string; subtitle?: string; className?: string }) {
  return (
    <div className={`rounded-xl border border-brand-border bg-brand-cardBg overflow-hidden ${className ?? ''}`}>
      <div className="p-4">
        <div className="mb-3">
          <div className="text-sm font-bold text-brand-textActive">{title}</div>
          {subtitle && <div className="text-[11px] text-brand-textMuted">{subtitle}</div>}
        </div>
        {children}
      </div>
    </div>
  );
}
