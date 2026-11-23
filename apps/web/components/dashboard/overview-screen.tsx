"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Activity, ArrowDownRight, ArrowRight, ArrowUpRight, GitBranch, GitCommitHorizontal, RefreshCw } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { apiRequest, formatDate, loadAnalytics, relativeTime, type Analytics, type Intelligence } from "@/lib/dashboard-api";
import { ActionButton, EmptyState, ErrorNotice, HealthTag, PageHeading, SectionHeading, StatStrip, Surface, TableSkeleton } from "@/components/dashboard/screen-kit";

export function OverviewScreen() {
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null);
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [activity, signals] = await Promise.all([
        loadAnalytics({ days, category: "all" }),
        apiRequest<Intelligence>("/github/intelligence"),
      ]);
      setAnalytics(activity);
      setIntelligence(signals);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load the workspace overview");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => { void load(); }, [load]);

  const needsAttention = (analytics?.repositoryHealth ?? [])
    .filter((repository) => repository.unresolvedIssues > 0 || repository.pendingPullRequests > 0)
    .sort((a, b) => (b.unresolvedIssues + b.pendingPullRequests) - (a.unresolvedIssues + a.pendingPullRequests))
    .slice(0, 5);
  const events = intelligence?.recentEvents.slice(0, 6) ?? [];

  return <div className="space-y-6">
    <PageHeading eyebrow="Workspace / Command center" title="Overview" description="A live read on repository activity, open work, and signals that need attention." action={<>
      <select value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Overview date range" className="h-9 rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--surface))] px-3 text-xs"><option value={7}>Past week</option><option value={30}>Past 30 days</option><option value={90}>Past 90 days</option></select>
      <ActionButton onClick={() => void load()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</ActionButton>
    </>} />

    {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}

    {loading && !analytics ? <div className="h-24 animate-pulse rounded-xl bg-[rgb(var(--surface-raised))]" /> : analytics ? <StatStrip items={[
      { label: "Connected repositories", value: analytics.overview.connectedRepositories },
      { label: `Commits · ${days}d`, value: analytics.overview.totalCommits },
      { label: "Open pull requests", value: analytics.overview.openPullRequests },
      { label: "Open issues", value: analytics.overview.openIssues },
    ]} /> : null}

    {analytics?.overview.connectedRepositories === 0 && !loading ? <EmptyState title="Connect a repository to get started" description="Install the DevScope GitHub App and choose the repositories this workspace should monitor. Your overview will populate with live GitHub data." action={<ActionButton href="/dashboard/repositories" variant="primary"><GitBranch className="h-3.5 w-3.5" />Explore repositories</ActionButton>} /> : null}

    {analytics && analytics.overview.connectedRepositories > 0 ? <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.85fr)]">
      <div className="space-y-5">
        <Surface>
          <div className="flex items-start justify-between gap-4 border-b border-[rgb(var(--line))] px-4 py-4 sm:px-5"><div><SectionHeading title="Commit cadence" detail={`${formatDate(analytics.dateRange.start)} – ${formatDate(analytics.dateRange.end)} · GitHub commit history`} /></div><Link href="/dashboard/analytics" className="mt-0.5 inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-[rgb(var(--accent))]">Details <ArrowRight className="h-3 w-3" /></Link></div>
          <div className="h-[260px] px-2 pb-2 pt-4 sm:h-[300px] sm:px-4">
            {analytics.commits.daily.every((point) => point.value === 0) ? <div className="grid h-full place-items-center text-xs text-[rgb(var(--muted))]">No commits in this period.</div> : <ResponsiveContainer width="100%" height="100%"><LineChart data={analytics.commits.daily} margin={{ top: 4, right: 8, bottom: 0, left: -20 }}><CartesianGrid vertical={false} stroke="rgb(var(--line))" strokeDasharray="3 5" /><XAxis dataKey="date" tickFormatter={(value) => formatDate(value)} minTickGap={28} tick={{ fill: "rgb(var(--muted))", fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} width={35} tick={{ fill: "rgb(var(--muted))", fontSize: 10 }} axisLine={false} tickLine={false} /><Tooltip labelFormatter={(value) => formatDate(String(value), { month: "long", day: "numeric", year: "numeric" })} contentStyle={{ borderRadius: 10, border: "1px solid rgb(var(--line))", background: "rgb(var(--surface))", fontSize: 11 }} /><Line type="monotone" dataKey="value" name="Commits" stroke="rgb(var(--accent))" strokeWidth={2} dot={false} activeDot={{ r: 4 }} /></LineChart></ResponsiveContainer>}
          </div>
        </Surface>

        <Surface>
          <div className="flex items-center justify-between border-b border-[rgb(var(--line))] px-4 py-4 sm:px-5"><SectionHeading title="Repositories to watch" detail="Open work is a useful queue signal, not a score." /><Link href="/dashboard/intelligence" className="text-[11px] font-medium text-[rgb(var(--accent))]">View intelligence</Link></div>
          {loading ? <TableSkeleton rows={4} /> : needsAttention.length ? <div className="divide-y divide-[rgb(var(--line))]">{needsAttention.map((repository) => <div key={repository.id} className="flex flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:px-5"><div className="min-w-0 flex-1"><a href={`https://github.com/${repository.name}`} target="_blank" rel="noreferrer" className="truncate text-xs font-semibold hover:text-[rgb(var(--accent))]">{repository.name}</a><p className="mt-1 truncate text-[11px] text-[rgb(var(--muted))]">{repository.primaryLanguage ?? "Language not detected"} · {repository.visibility}</p></div><div className="flex items-center gap-3 text-[11px] tabular-nums"><span>{repository.unresolvedIssues} issues</span><span className="text-[rgb(var(--line))]">/</span><span>{repository.pendingPullRequests} PRs</span><span className={`ml-1 inline-flex items-center gap-1 ${repository.lastUpdated ? "text-[rgb(var(--muted))]" : "text-amber-600"}`}>{repository.lastUpdated ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}{relativeTime(repository.lastUpdated)}</span></div></div>)}</div> : <p className="px-5 py-8 text-center text-xs text-[rgb(var(--muted))]">No open issues or pull requests in these repositories.</p>}
        </Surface>
      </div>

      <div className="space-y-5">
        <Surface>
          <div className="border-b border-[rgb(var(--line))] px-4 py-4 sm:px-5"><SectionHeading title="Recent GitHub activity" detail="Events received from connected installations" /></div>
          {events.length ? <div className="divide-y divide-[rgb(var(--line))]">{events.map((event) => <div key={event.id} className="flex gap-3 px-4 py-3.5 sm:px-5"><Activity className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[rgb(var(--cyan))]" /><div className="min-w-0"><p className="truncate text-xs font-medium">{event.title}</p><p className="mt-1 truncate text-[10px] text-[rgb(var(--muted))]">{event.repository} · {event.eventType.replaceAll("_", " ")}{event.action ? ` / ${event.action}` : ""}</p><p className="mt-1 text-[10px] text-[rgb(var(--muted))]">{relativeTime(event.occurredAt)}</p></div></div>)}</div> : <div className="px-5 py-9 text-center"><p className="text-xs font-medium">No events received yet</p><p className="mx-auto mt-1.5 max-w-[240px] text-[11px] leading-5 text-[rgb(var(--muted))]">Connect GitHub and enable webhooks to see event history here.</p></div>}
          <Link href="/dashboard/activity" className="flex items-center justify-between border-t border-[rgb(var(--line))] px-5 py-3 text-[11px] font-medium text-[rgb(var(--accent))]">Open activity stream <ArrowRight className="h-3 w-3" /></Link>
        </Surface>

        <Surface className="p-4 sm:p-5">
          <div className="flex items-start gap-3"><span className="grid h-8 w-8 place-items-center rounded-lg bg-[rgb(var(--accent-soft))] text-[rgb(var(--accent))]"><GitCommitHorizontal className="h-4 w-4" /></span><div className="min-w-0 flex-1"><p className="text-xs font-semibold">Pull request flow</p><p className="mt-1 text-[11px] text-[rgb(var(--muted))]">{analytics.pullRequests.merged} merged in this period</p></div></div>
          <div className="mt-4 flex items-end justify-between border-t border-[rgb(var(--line))] pt-4"><div><p className="text-[22px] font-semibold tracking-[-.04em] tabular-nums">{analytics.pullRequests.averageDaysToMerge ?? "—"}</p><p className="mt-1 text-[10px] text-[rgb(var(--muted))]">Average days to merge</p></div><Link href="/dashboard/pull-requests" className="inline-flex items-center gap-1 text-[11px] font-medium text-[rgb(var(--accent))]">PR queue <ArrowRight className="h-3 w-3" /></Link></div>
        </Surface>

        {intelligence?.repositories.some((repository) => repository.health) ? <Surface className="p-4 sm:p-5"><SectionHeading title="Health signals" detail="Based on verified webhook activity" /><div className="mt-3 space-y-2.5">{intelligence.repositories.filter((repository) => repository.health).slice(0, 4).map((repository) => <div key={repository.id} className="flex items-center gap-3"><span className="min-w-0 flex-1 truncate text-[11px]">{repository.name}</span><span className="w-10 text-right font-mono text-[10px] text-[rgb(var(--muted))]">{repository.health?.score}</span><HealthTag status={repository.health?.status ?? "UNKNOWN"} /></div>)}</div></Surface> : null}
      </div>
    </div> : null}
  </div>;
}
