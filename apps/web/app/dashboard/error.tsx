"use client";

export default function DashboardError({ reset }: { error: Error; reset: () => void }) {
  return <div className="grid min-h-[60vh] place-items-center px-6 text-center"><div className="max-w-sm"><div className="mx-auto h-9 w-9 rounded-xl border border-rose-500/30 bg-rose-500/10" /><h1 className="mt-4 text-sm font-semibold">This workspace view could not load</h1><p className="mt-2 text-xs leading-5 text-[rgb(var(--muted))]">Check that the API and database are available, then try again.</p><button type="button" onClick={reset} className="mt-5 h-9 rounded-lg bg-[rgb(var(--accent))] px-4 text-xs font-medium text-white">Retry</button></div></div>;
}
 