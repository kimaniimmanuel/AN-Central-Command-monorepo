import { getServerAuthOrRedirect } from '@/lib/server-auth';
import { PrintButton } from '@/components/print-button';
import {
  PLATFORM_REPORTS,
  REPORT_SCHEDULE,
  OPPONENTS,
  MONITORED_FIGURES,
  NETWORK_NOTES,
  WARD_MOOD,
} from '@/data/intelligence-demo';

// /reports/print — the wordy, PDF-oriented version of the daily report.
//
// Built to be printed (Ctrl+P → Save as PDF). Layout chrome carries `print:hidden`
// so only this document prints. Full case detail per platform; opponents with
// their account links; network + ward mood appendix.

export const runtime = 'nodejs';

export default async function ReportPrintPage() {
  await getServerAuthOrRedirect();
  const generatedAt = new Date().toLocaleString('en-GB', {
    timeZone: 'Africa/Nairobi', dateStyle: 'full', timeStyle: 'short',
  });

  return (
    <div className="mx-auto max-w-3xl bg-white text-slate-900 print:max-w-none">
      {/* Toolbar (screen only) */}
      <div className="print:hidden flex items-center justify-between mb-6">
        <span className="text-xs text-brand-textMuted">Preview — then Print / Save as PDF</span>
        <PrintButton />
      </div>

      {/* Document header */}
      <header className="border-b-2 border-slate-900 pb-3 mb-5">
        <div className="text-[11px] font-bold uppercase tracking-[0.3em] text-slate-500">Alfayo Nelson Central Command</div>
        <h1 className="text-2xl font-black">Daily Data Report — Social Listening</h1>
        <div className="text-xs text-slate-500 mt-1">
          Generated {generatedAt} · {REPORT_SCHEDULE.label}
        </div>
        <p className="mt-2 text-[11px] text-amber-700 font-semibold">
          ⚠️ Preview on sample data — not real intelligence until sources are connected.
        </p>
      </header>

      {/* Per-platform full case */}
      {PLATFORM_REPORTS.map((r) => {
        const tot = r.sentiment.praise + r.sentiment.neutral + r.sentiment.criticism;
        const praisePct = tot ? Math.round((r.sentiment.praise / tot) * 100) : 0;
        return (
          <section key={r.platform} className="mb-6 break-inside-avoid">
            <h2 className="text-lg font-black border-b border-slate-300 pb-1 mb-2">
              {r.label} <span className="text-xs font-semibold text-slate-500">· {r.mentions.toLocaleString()} mentions · {praisePct}% praise</span>
            </h2>
            <p className="text-sm font-semibold text-slate-700 mb-3">{r.headline}</p>
            <ol className="space-y-3">
              {r.casePoints.map((c) => (
                <li key={c.rank} className="text-sm">
                  <div className="font-bold">
                    {c.rank}. {c.point}
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-slate-500">[{c.weight} · {c.sentiment}]</span>
                  </div>
                  <p className="mt-0.5 text-slate-700 leading-relaxed">{c.detail}</p>
                </li>
              ))}
            </ol>
          </section>
        );
      })}

      {/* Opponents */}
      <section className="mb-6 break-inside-avoid">
        <h2 className="text-lg font-black border-b border-slate-300 pb-1 mb-2">Opponent watch</h2>
        {OPPONENTS.map((o) => {
          const figure = MONITORED_FIGURES.find((f) => f.id === o.id);
          return (
            <div key={o.id} className="mb-3 text-sm">
              <div className="font-bold">{o.name} ({o.tag}) — {o.shareOfVoice}% share of voice</div>
              <p className="text-slate-700">{o.topLine}</p>
              <div className="text-xs text-slate-600 mt-0.5">
                {figure?.accounts.map((a, i) => (
                  <span key={i} className="mr-3">{a.platform}: {a.url}</span>
                ))}
              </div>
              {figure?.note && <p className="text-xs text-amber-700 mt-0.5">{figure.note}</p>}
            </div>
          );
        })}
      </section>

      {/* Network + ward mood appendix */}
      <section className="mb-6 break-inside-avoid">
        <h2 className="text-lg font-black border-b border-slate-300 pb-1 mb-2">Our network — field reports</h2>
        <ul className="space-y-1.5 text-sm">
          {NETWORK_NOTES.map((n) => (
            <li key={n.id}><strong>{n.circle} · {n.area}</strong> ({n.mood}): {n.note}</li>
          ))}
        </ul>
      </section>

      <section className="mb-8 break-inside-avoid">
        <h2 className="text-lg font-black border-b border-slate-300 pb-1 mb-2">Ward mood — praise vs criticism</h2>
        <table className="w-full text-sm">
          <tbody>
            {WARD_MOOD.map((w) => (
              <tr key={w.ward} className="border-b border-slate-200">
                <td className="py-1 font-semibold">{w.ward}</td>
                <td className="py-1 text-emerald-700 text-right">{w.praise}% praise</td>
                <td className="py-1 text-red-700 text-right">{w.criticism}% criticism</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <footer className="text-[10px] text-slate-400 border-t border-slate-200 pt-2">
        Confidential — Alfayo Nelson Central Command. For campaign leadership use only.
      </footer>
    </div>
  );
}
