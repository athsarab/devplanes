"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, GitPullRequest, RefreshCw, Search } from "lucide-react";
import { apiRequest, loadAnalytics, type Analytics, type BottleneckOverview } from "@/lib/dashboard-api";
import { ActionButton, EmptyState, ErrorNotice, HealthTag, PageHeading, SectionHeading, SelectControl, StatStrip, Surface, TableDensityToggle, TableSkeleton } from "@/components/dashboard/screen-kit";

export function PullRequestScreen() {
  const [data, setData] = useState<Analytics | null>(null);
  const [days, setDays] = useState("30");
  const [stateFilter, setStateFilter] = useState("open");
  const [query, setQuery] = useState("");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [bottlenecks, setBottlenecks] = useState<BottleneckOverview | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [analytics, bottleneckOverview] = await Promise.all([
        loadAnalytics({ days: Number(days), category: "pull_requests" }),
        apiRequest<BottleneckOverview>(`/bottlenecks/overview?start=${new Date(Date.now() - (Number(days) - 1) * 86_400_000).toISOString().slice(0, 10)}`),
      ]);
      setData(analytics);
      setBottlenecks(bottleneckOverview);
    }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load pull requests"); }
    finally { setLoading(false); }
  }, [days]);
  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => (data?.pullRequests.items ?? [])
    .filter((item) => stateFilter === "all" || (stateFilter === "merged" ? Boolean(item.mergedAt) : stateFilter === "open" ? item.state === "open" : item.state === "closed" && !item.mergedAt))
    .filter((item) => !query || `${item.title} ${item.repository} ${item.author ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "")), [data, stateFilter, query]);

  return <div className="space-y-6">
    <PageHeading eyebrow="Engineering / Delivery" title="Pull request control room" description="Review open work, spot aging requests, and understand merge throughput across connected repositories." action={<>
      <SelectControl label="Date range" value={days} onChange={setDays} options={[{ label: "7 days", value: "7" }, { label: "30 days", value: "30" }, { label: "90 days", value: "90" }]} />
      <ActionButton onClick={() => void load()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</ActionButton>
    </>} />
    {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}
    {data ? <StatStrip items={[
      { label: "Open now", value: data.pullRequests.open },
      { label: "Merged in range", value: data.pullRequests.merged },
      { label: "Stale · 30+ days", value: data.pullRequests.stale },
      { label: "Avg. time to merge", value: data.pullRequests.averageDaysToMerge === null ? "—" : `${data.pullRequests.averageDaysToMerge}d` },
    ]} /> : loading ? <div className="h-24 animate-pulse rounded-xl bg-[rgb(var(--surface-raised))]" /> : null}
    {bottlenecks ? <Surface>
      <div className="border-b border-[rgb(var(--line))] px-4 py-4 sm:px-5"><SectionHeading title="Delivery bottlenecks" detail="Verified lifecycle findings; missing history is not treated as a delay." /></div>
      {bottlenecks.findings.length ? <div className="divide-y divide-[rgb(var(--line))]">{bottlenecks.findings.slice(0, 8).map((finding) => <div key={`${finding.repositoryId}-${finding.findingType}-${finding.referenceNumber ?? "repository"}`} className="flex items-start justify-between gap-4 px-4 py-3.5 sm:px-5"><div className="min-w-0"><p className="text-xs font-medium">{finding.findingType.replaceAll("_", " ")}</p><p className="mt-1 text-[11px] text-[rgb(var(--muted))]">{finding.repositoryReference}{finding.referenceNumber ? ` · #${finding.referenceNumber}` : ""}</p><p className="mt-1 text-[10px] text-[rgb(var(--muted))]">{finding.suggestedAction}</p></div><span className="shrink-0 rounded-full border border-[rgb(var(--line))] px-2 py-1 text-[10px] font-medium">{finding.severity}</span></div>)}</div> : <div className="px-5 py-8 text-center text-xs text-[rgb(var(--muted))]">No verified bottlenecks detected for the current data.</div>}
    </Surface> : null}
    {data?.overview.connectedRepositories === 0 && !loading ? <EmptyState title="No pull request data" description="Connect GitHub repositories to load their pull request queues." action={<ActionButton href="/dashboard/repositories" variant="primary">Connect repositories</ActionButton>} /> : null}
    {data?.overview.connectedRepositories ? <Surface>
      <div className="flex flex-col gap-3 border-b border-[rgb(var(--line))] px-4 py-3 sm:flex-row sm:items-center sm:px-5"><div className="flex flex-1 flex-wrap items-center gap-2"><div className="flex items-center gap-1 rounded-lg bg-[rgb(var(--surface-raised))] p-1">{[{ key: "open", label: "Open" }, { key: "merged", label: "Merged" }, { key: "closed", label: "Closed" }, { key: "all", label: "All" }].map((item) => <button key={item.key} type="button" onClick={() => setStateFilter(item.key)} aria-pressed={stateFilter === item.key} className={`rounded-md px-2.5 py-1.5 text-[11px] ${stateFilter === item.key ? "bg-[rgb(var(--surface))] font-medium shadow-sm" : "text-[rgb(var(--muted))]"}`}>{item.label}</button>)}</div><label className="flex h-8 min-w-[180px] flex-1 items-center gap-2 rounded-lg border border-[rgb(var(--line))] px-2.5"><Search className="h-3 w-3 text-[rgb(var(--muted))]" /><span className="sr-only">Filter pull requests</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter title, author, repository" className="min-w-0 flex-1 bg-transparent text-[11px] outline-none" /></label></div><div className="flex items-center justify-between gap-2 sm:justify-end"><span className="text-[10px] text-[rgb(var(--muted))]">{filtered.length} pull requests</span><TableDensityToggle value={density} onChange={setDensity} /></div></div>
      {loading ? <TableSkeleton rows={6} /> : filtered.length ? <div className="workspace-scrollbar overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left"><thead><tr className="border-b border-[rgb(var(--line))] bg-[rgb(var(--surface-raised))] text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]"><th className="px-4 py-3 font-medium sm:px-5">Pull request</th><th className="px-3 py-3 font-medium">Repository</th><th className="px-3 py-3 font-medium">Author</th><th className="px-3 py-3 font-medium">State</th><th className="px-3 py-3 font-medium">Updated</th><th className="px-4 py-3 text-right font-medium sm:px-5">GitHub</th></tr></thead><tbody>{filtered.map((item) => <tr key={`${item.repositoryId}-${item.number}`} className={`border-b border-[rgb(var(--line))] last:border-0 hover:bg-[rgb(var(--surface-raised))] ${density === "compact" ? "h-11" : "h-[62px]"}`}><td className="max-w-[380px] px-4 sm:px-5"><div className="flex items-center gap-2"><GitPullRequest className={`h-3.5 w-3.5 shrink-0 ${item.mergedAt ? "text-violet-500" : item.state === "open" ? "text-emerald-600" : "text-[rgb(var(--muted))]"}`} /><span className="truncate text-xs font-medium">{item.title}</span>{item.draft ? <span className="rounded border border-[rgb(var(--line))] px-1 py-0.5 text-[9px] text-[rgb(var(--muted))]">Draft</span> : null}</div><p className="mt-1 pl-[22px] text-[10px] text-[rgb(var(--muted))]">#{item.number}</p></td><td className="max-w-[180px] truncate px-3 text-[11px] text-[rgb(var(--muted))]">{item.repository}</td><td className="px-3 text-[11px] text-[rgb(var(--muted))]">{item.author ?? "Unknown"}</td><td className="px-3"><HealthTag status={item.mergedAt ? "merged" : item.state} /></td><td className="px-3 text-[10px] text-[rgb(var(--muted))]">{item.updatedAt ? new Date(item.updatedAt).toLocaleDateString() : "—"}</td><td className="px-4 text-right sm:px-5">{item.url ? <a href={item.url} target="_blank" rel="noreferrer" aria-label={`Open pull request ${item.number} on GitHub`} className="inline-grid h-7 w-7 place-items-center rounded-md text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface))]"><ExternalLink className="h-3.5 w-3.5" /></a> : "—"}</td></tr>)}</tbody></table></div> : <div className="px-5 py-12 text-center"><p className="text-xs font-medium">No matching pull requests</p><p className="mt-1 text-[11px] text-[rgb(var(--muted))]">Adjust the state filter or search term.</p></div>}
    </Surface> : null}
  </div>;
}
