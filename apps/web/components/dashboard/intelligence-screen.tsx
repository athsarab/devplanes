"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink, RefreshCw, ShieldAlert, ShieldCheck } from "lucide-react";
import { apiRequest, loadAnalytics, type Analytics, type Intelligence, type HealthSummary } from "@/lib/dashboard-api";
import { ActionButton, EmptyState, ErrorNotice, HealthTag, PageHeading, SectionHeading, StatStrip, Surface, TableSkeleton } from "@/components/dashboard/screen-kit";

export function IntelligenceScreen() {
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [healthSummary, setHealthSummary] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [signals, metrics, health] = await Promise.all([
        apiRequest<Intelligence>("/github/intelligence"),
        loadAnalytics({ days: 30, category: "health" }),
        apiRequest<HealthSummary>("/health/repositories"),
      ]);
      setIntelligence(signals);
      setAnalytics(metrics);
      setHealthSummary(health);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load repository intelligence");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = intelligence?.repositories ?? [];
  const atRisk = rows.filter((repository) => repository.health?.status === "AT_RISK").length;
  const watch = rows.filter((repository) => repository.health?.status === "WATCH").length;
  const awaiting = rows.filter((repository) => !repository.health).length;

  return <div className="space-y-6">
    <PageHeading eyebrow="Workspace / Signals" title="Repository intelligence" description="Repository health is calculated from verified webhook activity; current issue and pull request counts are queried from GitHub." action={<ActionButton onClick={() => void load()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Recalculate</ActionButton>} />
    {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}
    {intelligence && analytics ? <StatStrip items={[
      { label: "Repositories monitored", value: analytics.overview.connectedRepositories },
      { label: "At risk", value: atRisk, note: "Health signal" },
      { label: "Watch", value: watch, note: "Health signal" },
      { label: "Awaiting webhook data", value: awaiting },
    ]} /> : loading ? <div className="h-24 animate-pulse rounded-xl bg-[rgb(var(--surface-raised))]" /> : null}

    {healthSummary?.repositories.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{healthSummary.repositories.map((repository) => <Surface key={repository.repositoryId} className="p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-xs font-semibold">{repository.repositoryName}</p><p className="mt-1 text-[10px] text-[rgb(var(--muted))]">{repository.category} · {repository.dataCompleteness.status}</p></div><span className="font-mono text-xl font-semibold tabular-nums">{repository.overallScore}</span></div></Surface>)}</div> : null}

    {intelligence && !intelligence.repositories.length ? <EmptyState title="No repositories to assess" description="Connect repositories to this workspace. Health signals will appear as GitHub delivers verified events." action={<ActionButton href="/dashboard/repositories" variant="primary">Connect repositories <ArrowRight className="h-3.5 w-3.5" /></ActionButton>} /> : null}

    {intelligence?.repositories.length ? <Surface>
      <div className="border-b border-[rgb(var(--line))] px-4 py-4 sm:px-5"><SectionHeading title="Health by repository" detail="Signals reflect recent pushes, unresolved issues, and stale pull requests." /></div>
      {loading ? <TableSkeleton rows={rows.length || 5} /> : <div className="workspace-scrollbar overflow-x-auto"><table className="w-full min-w-[780px] border-collapse text-left text-xs"><thead><tr className="border-b border-[rgb(var(--line))] bg-[rgb(var(--surface-raised))] text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]"><th className="px-4 py-3 font-medium sm:px-5">Repository</th><th className="px-3 py-3 font-medium">Health</th><th className="px-3 py-3 text-right font-medium">Score</th><th className="px-3 py-3 text-right font-medium">Pushes · 30d</th><th className="px-3 py-3 text-right font-medium">Open issues</th><th className="px-3 py-3 text-right font-medium">Stale PRs</th><th className="px-4 py-3 text-right font-medium sm:px-5">Trend</th></tr></thead><tbody>{rows.map((repository) => {
        const health = repository.health;
        return <tr key={repository.id} className="border-b border-[rgb(var(--line))] last:border-0 align-middle hover:bg-[rgb(var(--surface-raised))]"><td className="max-w-[280px] px-4 py-3.5 sm:px-5"><a href={`https://github.com/${repository.name}`} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-center gap-2 font-semibold hover:text-[rgb(var(--accent))]"><span className="truncate">{repository.name}</span><ExternalLink className="h-3 w-3 shrink-0 text-[rgb(var(--muted))]" /></a>{health?.explanations.length ? <p className="mt-1 truncate text-[10px] text-[rgb(var(--muted))]">{String(health.explanations[0])}</p> : null}</td><td className="px-3"><HealthTag status={health?.status ?? "UNKNOWN"} /></td><td className="px-3 text-right font-mono tabular-nums">{health?.score ?? "—"}</td><td className="px-3 text-right font-mono tabular-nums">{health?.pushes30d ?? "—"}</td><td className="px-3 text-right font-mono tabular-nums">{health?.unresolvedIssues ?? "—"}</td><td className="px-3 text-right font-mono tabular-nums">{health?.stalePullRequests ?? "—"}</td><td className="px-4 text-right text-[rgb(var(--muted))] sm:px-5">{health?.activityTrend ?? "Awaiting events"}</td></tr>;
      })}</tbody></table></div>}
    </Surface> : null}

    {analytics?.inaccessible.length ? <Surface className="border-amber-500/30"><div className="flex items-center gap-2 border-b border-[rgb(var(--line))] px-4 py-3 text-xs font-semibold text-amber-700 dark:text-amber-300"><ShieldAlert className="h-4 w-4" />GitHub access needs attention</div><div className="divide-y divide-[rgb(var(--line))]">{analytics.inaccessible.map((item) => <div key={item.repositoryId} className="flex items-center justify-between gap-4 px-4 py-3 text-xs"><span className="truncate font-medium">{item.fullName}</span><span className="shrink-0 text-[rgb(var(--muted))]">{item.reason}</span></div>)}</div></Surface> : null}

    {intelligence?.recentEvents.length ? <Surface>
      <div className="flex items-center justify-between border-b border-[rgb(var(--line))] px-4 py-4 sm:px-5"><SectionHeading title="Recent signal changes" detail="GitHub webhook deliveries processed by DevScope" /><Link href="/dashboard/activity" className="text-[11px] font-medium text-[rgb(var(--accent))]">Activity log</Link></div>
      <div className="divide-y divide-[rgb(var(--line))]">{intelligence.recentEvents.slice(0, 8).map((event) => <div key={event.id} className="flex items-center gap-3 px-4 py-3 sm:px-5"><ShieldCheck className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--cyan))]" /><span className="min-w-0 flex-1 truncate text-xs">{event.title}</span><span className="hidden shrink-0 text-[10px] text-[rgb(var(--muted))] sm:block">{event.repository}</span><span className="shrink-0 text-[10px] text-[rgb(var(--muted))]">{new Date(event.occurredAt).toLocaleDateString()}</span></div>)}</div>
    </Surface> : null}
  </div>;
}
