'use client';

// Triggers the browser print dialog → user picks "Save as PDF". Dependency-free.
export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="print:hidden rounded-lg bg-brand-burnt px-4 py-2 text-sm font-bold text-white hover:bg-brand-rust transition"
    >
      🖨️ Print / Save as PDF
    </button>
  );
}
