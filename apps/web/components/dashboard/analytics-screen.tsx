"use client";

import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Download, RefreshCw } from "lucide-react";
import { apiRequest, formatDate, loadAnalytics, type Analytics, type Repository } from "@/lib/dashboard-api";
import { ActionButton, EmptyState, ErrorNotice, PageHeading, SectionHeading, SelectControl, StatStrip, Surface, TableSkeleton } from "@/components/dashboard/screen-kit";

function downloadCsv(analytics: Analytics) {
  const lines = [
    ["Repository", "Commits", "Open issues", "Open pull requests"],
    ...analytics.commits.repositoryComparison.map((row) => [row.name, row.commits, row.openIssues, row.openPullRequests]),
  ].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","));
  const blob = new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `devscope-analytics-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function AnalyticsScreen() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [days, setDays] = useState("30");
  const [repositoryId, setRepositoryId] = useState("");
  const [category, setCategory] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setAnalytics(await loadAnalytics({ days: Number(days), category, repositoryId }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load analytics");
    } finally { setLoading(false); }
  }, [days, category, repositoryId]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void apiRequest<Repository[]>("/github/repositories").then(setRepositories).catch(() => setRepositories([]));
  }, []);

  return <div className="space-y-6">
    <PageHeading eyebrow="Engineering / Analysis" title="Analytics" description="Compare engineering activity across repositories and time. Metrics are queried directly from GitHub." action={<>
      <SelectControl label="Date range" value={days} onChange={setDays} options={[{ label: "7 days", value: "7" }, { label: "30 days", value: "30" }, { label: "90 days", value: "90" }]} />
      <SelectControl label="Repository" value={repositoryId} onChange={setRepositoryId} options={[{ label: "All repositories", value: "" }, ...repositories.map((repository) => ({ label: repository.fullName, value: repository.id }))]} />
      <SelectControl label="Activity category" value={category} onChange={setCategory} options={[{ label: "All activity", value: "all" }, { label: "Commits", value: "commits" }, { label: "Issues", value: "issues" }, { label: "Pull requests", value: "pull_requests" }, { label: "Health", value: "health" }]} />
      <ActionButton onClick={() => analytics && downloadCsv(analytics)} disabled={!analytics || loading}><Download className="h-3.5 w-3.5" />Export CSV</ActionButton>
      <ActionButton onClick={() => void load()} disabled={loading} title="Refresh analytics"><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /></ActionButton>
    </>} />

    {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}
    {loading && !analytics ? <div className="space-y-4"><div className="h-24 animate-pulse rounded-xl bg-[rgb(var(--surface-raised))]" /><div className="h-[340px] animate-pulse rounded-xl bg-[rgb(var(--surface-raised))]" /></div> : null}
    {analytics && analytics.overview.connectedRepositories === 0 ? <EmptyState title="No repository data yet" description="Connect a GitHub repository to compare commit activity, issue movement, and pull request throughput." /> : null}

    {analytics && analytics.overview.connectedRepositories > 0 ? <>
      <StatStrip items={[
        { label: "Commits in range", value: analytics.overview.totalCommits, note: `${days} day window` },
        { label: "Issues opened / closed", value: `${analytics.issues.created.reduce((sum, point) => sum + point.value, 0)} / ${analytics.issues.resolved.reduce((sum, point) => sum + point.value, 0)}` },
        { label: "PRs merged", value: analytics.pullRequests.merged, note: analytics.pullRequests.averageDaysToMerge === null ? "Merge time unavailable" : `${analytics.pullRequests.averageDaysToMerge}d average` },
        { label: "Contributors", value: analytics.commits.contributors.length },
      ]} />

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(300px,.7fr)]">
        <Surface>
          <div className="border-b border-[rgb(var(--line))] px-4 py-4 sm:px-5"><SectionHeading title="Daily commit volume" detail={`${formatDate(analytics.dateRange.start)} – ${formatDate(analytics.dateRange.end)}`} /></div>
          <div className="h-[300px] px-2 py-4 sm:h-[360px] sm:px-4">{loading ? <TableSkeleton rows={5} /> : <ResponsiveContainer width="100%" height="100%"><BarChart data={analytics.commits.daily} margin={{ top: 5, right: 8, bottom: 0, left: -18 }}><CartesianGrid vertical={false} stroke="rgb(var(--line))" strokeDasharray="3 5" /><XAxis dataKey="date" tickFormatter={(value) => formatDate(value)} minTickGap={28} tick={{ fill: "rgb(var(--muted))", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} width={32} tick={{ fill: "rgb(var(--muted))", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip labelFormatter={(value) => formatDate(String(value), { month: "long", day: "numeric", year: "numeric" })} contentStyle={{ borderRadius: 10, border: "1px solid rgb(var(--line))", background: "rgb(var(--surface))", fontSize: 11 }} /><Bar dataKey="value" name="Commits" fill="rgb(var(--accent))" radius={[3, 3, 0, 0]} maxBarSize={18} /></BarChart></ResponsiveContainer>}</div>
        </Surface>

        <Surface>
          <div className="border-b border-[rgb(var(--line))] px-4 py-4 sm:px-5"><SectionHeading title="Contributor activity" detail="Commit authors in the selected period" /></div>
          {analytics.commits.contributors.length ? <div className="divide-y divide-[rgb(var(--line))]">{analytics.commits.contributors.slice(0, 10).map((contributor, index) => <div key={contributor.name} className="flex items-center gap-3 px-4 py-3 sm:px-5"><span className="w-5 font-mono text-[10px] text-[rgb(var(--muted))]">{String(index + 1).padStart(2, "0")}</span><span className="min-w-0 flex-1 truncate text-xs">{contributor.name}</span><span className="font-mono text-xs tabular-nums">{contributor.commits}</span></div>)}</div> : <p className="px-5 py-8 text-center text-xs text-[rgb(var(--muted))]">No commit authors in this range.</p>}
        </Surface>
      </div>

      <Surface>
        <div className="border-b border-[rgb(var(--line))] px-4 py-4 sm:px-5"><SectionHeading title="Repository comparison" detail="Commit volume and currently open work" /></div>
        <div className="workspace-scrollbar overflow-x-auto"><table className="w-full min-w-[640px] border-collapse text-left text-xs"><thead><tr className="border-b border-[rgb(var(--line))] text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">{["Repository", "Commits", "Open issues", "Open pull requests", "Share of commits"].map((label) => <th key={label} className="px-4 py-3 font-medium sm:px-5">{label}</th>)}</tr></thead><tbody>{analytics.commits.repositoryComparison.map((row) => <tr key={row.repositoryId} className="border-b border-[rgb(var(--line))] last:border-0 hover:bg-[rgb(var(--surface-raised))]"><td className="px-4 py-3.5 font-medium sm:px-5"><a href={`https://github.com/${row.name}`} target="_blank" rel="noreferrer" className="hover:text-[rgb(var(--accent))]">{row.name}</a></td><td className="px-4 py-3.5 font-mono tabular-nums sm:px-5">{row.commits}</td><td className="px-4 py-3.5 font-mono tabular-nums sm:px-5">{row.openIssues}</td><td className="px-4 py-3.5 font-mono tabular-nums sm:px-5">{row.openPullRequests}</td><td className="px-4 py-3.5 sm:px-5"><div className="flex items-center gap-2"><div className="h-1.5 w-24 overflow-hidden rounded-full bg-[rgb(var(--surface-raised))]"><div className="h-full rounded-full bg-[rgb(var(--accent))]" style={{ width: `${analytics.overview.totalCommits ? Math.max(2, row.commits / analytics.overview.totalCommits * 100) : 0}%` }} /></div><span className="font-mono text-[10px] text-[rgb(var(--muted))]">{analytics.overview.totalCommits ? Math.round(row.commits / analytics.overview.totalCommits * 100) : 0}%</span></div></td></tr>)}</tbody></table></div>
      </Surface>
    </> : null}
  </div>;
}
