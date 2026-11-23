"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleDot, ExternalLink, RefreshCw, Search, UserRoundX } from "lucide-react";
import { apiRequest, loadAnalytics, type Analytics } from "@/lib/dashboard-api";
import { ActionButton, EmptyState, ErrorNotice, HealthTag, PageHeading, SectionHeading, SelectControl, StatStrip, Surface, TableDensityToggle, TableSkeleton } from "@/components/dashboard/screen-kit";

export function IssueScreen() {
  const [data, setData] = useState<Analytics | null>(null);
  const [days, setDays] = useState("30");
  const [stateFilter, setStateFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [unassignedOnly, setUnassignedOnly] = useState(false);
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [issueAging, setIssueAging] = useState<{ issues: Array<{ number: number; title: string; repositoryName: string; ageElapsedHours: number; ageWorkingHours: number }> } | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [analytics, aging] = await Promise.all([
        loadAnalytics({ days: Number(days), category: "issues" }),
        apiRequest<{ issues: Array<{ number: number; title: string; repositoryName: string; ageElapsedHours: number; ageWorkingHours: number }> }>(`/bottlenecks/issues/aging?status=open&start=${new Date(Date.now() - (Number(days) - 1) * 86_400_000).toISOString().slice(0, 10)}`),
      ]);
      setData(analytics);
      setIssueAging(aging);
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load issues"); }
    finally { setLoading(false); }
  }, [days]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => (data?.issues.items ?? [])
    .filter((item) => stateFilter === "all" || item.state === stateFilter)
    .filter((item) => !unassignedOnly || item.assignees === 0)
    .filter((item) => !query || `${item.title} ${item.repository} ${item.author ?? ""} ${item.labels.join(" ")}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")), [data, stateFilter, unassignedOnly, query]);

  return <div className="space-y-6">
    <PageHeading eyebrow="Engineering / Triage" title="Issue intelligence" description="A working queue for open issues, assignment gaps, and issue movement across repositories." action={<>
      <SelectControl label="Date range" value={days} onChange={setDays} options={[{ label: "7 days", value: "7" }, { label: "30 days", value: "30" }, { label: "90 days", value: "90" }]} />
      <ActionButton onClick={() => void load()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</ActionButton>
    </>} />
    {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}
    {data ? <StatStrip items={[
      { label: "Open now", value: data.issues.open },
      { label: "Closed in range", value: data.issues.resolved.reduce((sum, point) => sum + point.value, 0) },
      { label: "Created in range", value: data.issues.created.reduce((sum, point) => sum + point.value, 0) },
      { label: "Unassigned", value: data.issues.unassigned, note: "Open issues without assignees" },
    ]} /> : loading ? <div className="h-24 animate-pulse rounded-xl bg-[rgb(var(--surface-raised))]" /> : null}
    {issueAging?.issues.length ? <Surface>
      <div className="border-b border-[rgb(var(--line))] px-4 py-4 sm:px-5"><SectionHeading title="Issue aging" detail="Elapsed and configured UTC working-hour age; unavailable timestamps are omitted." /></div>
      <div className="divide-y divide-[rgb(var(--line))]">{issueAging.issues.slice(0, 6).map((issue) => <div key={`${issue.repositoryName}-${issue.number}`} className="flex items-center justify-between gap-4 px-4 py-3 sm:px-5"><div className="min-w-0"><p className="truncate text-xs font-medium">{issue.title}</p><p className="mt-1 text-[10px] text-[rgb(var(--muted))]">{issue.repositoryName} · #{issue.number}</p></div><div className="shrink-0 text-right"><p className="font-mono text-xs">{issue.ageElapsedHours}h elapsed</p><p className="mt-1 text-[10px] text-[rgb(var(--muted))]">{issue.ageWorkingHours}h working</p></div></div>)}</div>
    </Surface> : null}
    {data?.overview.connectedRepositories === 0 && !loading ? <EmptyState title="No issue data" description="Connect GitHub repositories to load open issues and triage signals." action={<ActionButton href="/dashboard/repositories" variant="primary">Connect repositories</ActionButton>} /> : null}
    {data?.overview.connectedRepositories ? <Surface>
      <div className="flex flex-col gap-3 border-b border-[rgb(var(--line))] px-4 py-3 sm:flex-row sm:items-center sm:px-5"><div className="flex flex-1 flex-wrap items-center gap-2"><div className="flex items-center gap-1 rounded-lg bg-[rgb(var(--surface-raised))] p-1">{[{ key: "open", label: "Open" }, { key: "closed", label: "Closed" }, { key: "all", label: "All" }].map((item) => <button key={item.key} type="button" onClick={() => setStateFilter(item.key)} aria-pressed={stateFilter === item.key} className={`rounded-md px-2.5 py-1.5 text-[11px] ${stateFilter === item.key ? "bg-[rgb(var(--surface))] font-medium shadow-sm" : "text-[rgb(var(--muted))]"}`}>{item.label}</button>)}</div><label className="flex h-8 min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-[rgb(var(--line))] px-2.5"><Search className="h-3 w-3 text-[rgb(var(--muted))]" /><span className="sr-only">Filter issues</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter title, label, author, repository" className="min-w-0 flex-1 bg-transparent text-[11px] outline-none" /></label><button type="button" onClick={() => setUnassignedOnly((current) => !current)} aria-pressed={unassignedOnly} className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] ${unassignedOnly ? "border-[rgb(var(--accent))]/40 bg-[rgb(var(--accent-soft))] text-[rgb(var(--accent))]" : "border-[rgb(var(--line))] text-[rgb(var(--muted))]"}`}><UserRoundX className="h-3 w-3" />Unassigned</button></div><div className="flex items-center justify-between gap-2 sm:justify-end"><span className="text-[10px] text-[rgb(var(--muted))]">{filtered.length} issues</span><TableDensityToggle value={density} onChange={setDensity} /></div></div>
      {loading ? <TableSkeleton rows={6} /> : filtered.length ? <div className="workspace-scrollbar overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left"><thead><tr className="border-b border-[rgb(var(--line))] bg-[rgb(var(--surface-raised))] text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]"><th className="px-4 py-3 font-medium sm:px-5">Issue</th><th className="px-3 py-3 font-medium">Repository</th><th className="px-3 py-3 font-medium">Labels</th><th className="px-3 py-3 font-medium">Assignees</th><th className="px-3 py-3 font-medium">State</th><th className="px-3 py-3 font-medium">Updated</th><th className="px-4 py-3 text-right font-medium sm:px-5">GitHub</th></tr></thead><tbody>{filtered.map((item) => <tr key={`${item.repositoryId}-${item.number}`} className={`border-b border-[rgb(var(--line))] last:border-0 hover:bg-[rgb(var(--surface-raised))] ${density === "compact" ? "h-11" : "h-[62px]"}`}><td className="max-w-[360px] px-4 sm:px-5"><div className="flex items-center gap-2"><CircleDot className={`h-3.5 w-3.5 shrink-0 ${item.state === "open" ? "text-emerald-600" : "text-violet-500"}`} /><span className="truncate text-xs font-medium">{item.title}</span></div><p className="mt-1 pl-[22px] text-[10px] text-[rgb(var(--muted))]">#{item.number} · {item.author ?? "Unknown author"}</p></td><td className="max-w-[150px] truncate px-3 text-[11px] text-[rgb(var(--muted))]">{item.repository}</td><td className="max-w-[160px] px-3"><div className="flex gap-1 overflow-hidden">{item.labels.slice(0, density === "compact" ? 1 : 2).map((label) => <span key={label} className="max-w-20 truncate rounded-md border border-[rgb(var(--line))] px-1.5 py-1 text-[9px] text-[rgb(var(--muted))]">{label}</span>)}{!item.labels.length ? <span className="text-[10px] text-[rgb(var(--muted))]">—</span> : null}</div></td><td className="px-3 font-mono text-[11px] tabular-nums">{item.assignees}</td><td className="px-3"><HealthTag status={item.state} /></td><td className="px-3 text-[10px] text-[rgb(var(--muted))]">{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "—"}</td><td className="px-4 text-right sm:px-5">{item.url ? <a href={item.url} target="_blank" rel="noreferrer" aria-label={`Open issue ${item.number} on GitHub`} className="inline-grid h-7 w-7 place-items-center rounded-md text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface))]"><ExternalLink className="h-3.5 w-3.5" /></a> : "—"}</td></tr>)}</tbody></table></div> : <div className="px-5 py-12 text-center"><p className="text-xs font-medium">No matching issues</p><p className="mt-1 text-[11px] text-[rgb(var(--muted))]">Adjust the state, assignment, or search filters.</p></div>}
    </Surface> : null}
  </div>;
}
