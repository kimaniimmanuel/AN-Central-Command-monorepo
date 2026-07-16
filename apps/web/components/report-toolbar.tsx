'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// Toolbar for the Daily Report: shows the nightly schedule + last-generated stamp,
// a "Generate now" action (POSTs to the regenerate endpoint), and a "Download PDF"
// that opens the print-optimized report so the browser can save it as a PDF.

export function ReportToolbar({ scheduleLabel, generatedAt }: { scheduleLabel: string; generatedAt: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  async function generateNow() {
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch('/api/reports/generate', { method: 'POST' });
      if (res.ok) {
        setFlash('Report regenerated ✓');
        router.refresh();
      } else {
        setFlash('Could not regenerate — try again.');
      }
    } catch {
      setFlash('Could not regenerate — try again.');
    } finally {
      setBusy(false);
      setTimeout(() => setFlash(null), 3500);
    }
  }

  return (
    <div className="rounded-xl border border-brand-border bg-brand-cardBg p-4 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-xs font-bold uppercase tracking-wider text-brand-textActive">{scheduleLabel}</span>
        </div>
        <div className="text-[11px] text-brand-textMuted mt-0.5">Last generated: {generatedAt} · {flash ?? 'Nyali time (EAT)'}</div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={generateNow}
          disabled={busy}
          className="rounded-lg border border-brand-border px-3 py-2 text-xs font-bold text-brand-textActive hover:border-brand-burnt hover:text-brand-burnt transition disabled:opacity-50"
        >
          {busy ? 'Generating…' : '↻ Generate now'}
        </button>
        <a
          href="/reports/print"
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-lg bg-brand-burnt px-3 py-2 text-xs font-bold text-white hover:bg-brand-rust transition"
        >
          ⬇ Download PDF
        </a>
      </div>
    </div>
  );
}
