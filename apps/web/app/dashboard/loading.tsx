export default function DashboardLoading() {
  return <div className="animate-pulse space-y-6" aria-label="Loading workspace"><div className="h-16 rounded-xl bg-[rgb(var(--surface-raised))]" /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <div key={item} className="h-24 rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--surface))]" />)}</div><div className="h-[340px] rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--surface))]" /></div>;
}
