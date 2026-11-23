"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRight, Download, FileText, RefreshCw } from "lucide-react";
import Link from "next/link";
import { formatDate, loadAnalytics, type Analytics } from "@/lib/dashboard-api";
import { ActionButton, EmptyState, ErrorNotice, PageHeading, SectionHeading, StatStrip, Surface, TableSkeleton } from "@/components/dashboard/screen-kit";

function exportReport(data: Analytics) {
  const lines = [
    ["DevScope weekly development report"],
    ["Period", formatDate(data.dateRange.start), formatDate(data.dateRange.end)],
    ["Repositories", data.overview.connectedRepositories],
    ["Commits", data.overview.totalCommits],
    ["Open issues", data.overview.openIssues],
    ["Issues closed in period", data.issues.resolved.reduce((sum, point) => sum + point.value, 0)],
    ["Open pull requests", data.overview.openPullRequests],
    ["Merged pull requests", data.pullRequests.merged],
    [],
    ["Repository", "Commits", "Open issues", "Open pull requests"],
    ...data.commits.repositoryComparison.map((item) => [item.name, item.commits, item.openIssues, item.openPullRequests]),
  ].map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(","));
  const url = URL.createObjectURL(new Blob([lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `devscope-weekly-report-${new Date().toISOString().slice(0, 10)}.csv`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ReportsScreen() {
  const [data, setData] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await loadAnalytics({ days: 7, category: "all" })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to prepare this week’s report"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <div className="space-y-6">
    <PageHeading eyebrow="Engineering / Reporting" title="Weekly report" description="A seven-day snapshot built from live GitHub activity for the current workspace." action={<>
      <ActionButton onClick={() => void load()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh report</ActionButton>
      <ActionButton onClick={() => data && exportReport(data)} disabled={!data || loading} variant="primary"><Download className="h-3.5 w-3.5" />Export CSV</ActionButton>
    </>} />
    {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}
    {data ? <p className="-mt-3 text-[11px] text-[rgb(var(--muted))]">Reporting period: {formatDate(data.dateRange.start, { month: "long", day: "numeric", year: "numeric" })} – {formatDate(data.dateRange.end, { month: "long", day: "numeric", year: "numeric" })}</p> : null}
    {data ? <StatStrip items={[
      { label: "Commits", value: data.overview.totalCommits, note: "Authored in this period" },
      { label: "Issues closed", value: data.issues.resolved.reduce((sum, point) => sum + point.value, 0) },
      { label: "Pull requests merged", value: data.pullRequests.merged },
      { label: "Repositories active", value: data.commits.repositoryComparison.filter((row) => row.commits > 0).length, note: `of ${data.overview.connectedRepositories} connected` },
    ]} /> : loading ? <div className="h-24 animate-pulse rounded-xl bg-[rgb(var(--surface-raised))]" /> : null}
    {data?.overview.connectedRepositories === 0 && !loading ? <EmptyState title="No activity to report" description="Once repositories are connected and activity is available, this report will summarize the last seven days." action={<ActionButton href="/dashboard/repositories" variant="primary">Connect repositories <ArrowRight className="h-3.5 w-3.5" /></ActionButton>} /> : null}
    {data?.overview.connectedRepositories ? <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(290px,.72fr)]">
      <Surface>
        <div className="flex items-center justify-between border-b border-[rgb(var(--line))] px-4 py-4 sm:px-5"><SectionHeading title="Repository contribution" detail="Observed commits and open work this week" /><span className="rounded-md bg-[rgb(var(--accent-soft))] p-2 text-[rgb(var(--accent))]"><FileText className="h-4 w-4" /></span></div>
        {loading ? <TableSkeleton rows={5} /> : <div className="workspace-scrollbar overflow-x-auto"><table className="w-full min-w-[560px] border-collapse text-left text-xs"><thead><tr className="border-b border-[rgb(var(--line))] text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]"><th className="px-4 py-3 font-medium sm:px-5">Repository</th><th className="px-3 py-3 text-right font-medium">Commits</th><th className="px-3 py-3 text-right font-medium">Open issues</th><th className="px-4 py-3 text-right font-medium sm:px-5">Open PRs</th></tr></thead><tbody>{data.commits.repositoryComparison.map((item) => <tr key={item.repositoryId} className="border-b border-[rgb(var(--line))] last:border-0"><td className="px-4 py-3.5 font-medium sm:px-5">{item.name}</td><td className="px-3 text-right font-mono tabular-nums">{item.commits}</td><td className="px-3 text-right font-mono tabular-nums">{item.openIssues}</td><td className="px-4 text-right font-mono tabular-nums sm:px-5">{item.openPullRequests}</td></tr>)}</tbody></table></div>}
      </Surface>
      <div className="space-y-5">
        <Surface className="p-4 sm:p-5"><SectionHeading title="Delivery notes" detail="Generated from current API metrics" /><div className="mt-4 space-y-4 text-xs leading-5"><p className="border-l-2 border-[rgb(var(--accent))] pl-3">{data.overview.totalCommits ? `${data.overview.totalCommits} commits landed across ${data.commits.repositoryComparison.filter((item) => item.commits > 0).length} active repositories.` : "No commits were found in the seven-day window."}</p><p className="border-l-2 border-[rgb(var(--cyan))] pl-3">{data.pullRequests.merged ? `${data.pullRequests.merged} pull requests merged${data.pullRequests.averageDaysToMerge === null ? "." : `, with a ${data.pullRequests.averageDaysToMerge} day average merge time.`}` : "No pull requests were merged in this period."}</p><p className="border-l-2 border-amber-500 pl-3">{data.issues.unassigned ? `${data.issues.unassigned} open issues currently have no assignee.` : "All open issues are assigned or the queue is empty."}</p></div></Surface>
        <Surface className="p-4 sm:p-5"><SectionHeading title="Continue analysis" /><div className="mt-2 divide-y divide-[rgb(var(--line))]">{[{ title: "Review pull request queue", href: "/dashboard/pull-requests" }, { title: "Triage open issues", href: "/dashboard/issues" }, { title: "Inspect health signals", href: "/dashboard/intelligence" }].map((item) => <Link key={item.href} href={item.href} className="flex items-center justify-between py-3 text-xs hover:text-[rgb(var(--accent))]">{item.title}<ArrowRight className="h-3.5 w-3.5" /></Link>)}</div></Surface>
      </div>
    </div> : null}
  </div>;
}
