"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, RefreshCw, Search } from "lucide-react";
import { apiRequest, type Intelligence } from "@/lib/dashboard-api";
import { ActionButton, EmptyState, ErrorNotice, PageHeading, SelectControl, Surface, TableSkeleton } from "@/components/dashboard/screen-kit";

export function ActivityScreen() {
  const [data, setData] = useState<Intelligence | null>(null);
  const [eventType, setEventType] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setData(await apiRequest<Intelligence>("/github/intelligence")); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load activity"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const eventTypes = useMemo(() => [...new Set(data?.recentEvents.map((event) => event.eventType) ?? [])].sort(), [data]);
  const events = (data?.recentEvents ?? []).filter((event) => eventType === "all" || event.eventType === eventType)
    .filter((event) => !query || `${event.title} ${event.repository} ${event.eventType} ${event.action ?? ""}`.toLowerCase().includes(query.toLowerCase()));
  const days = new Map<string, typeof events>();
  for (const event of events) {
    const key = new Date(event.occurredAt).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    days.set(key, [...(days.get(key) ?? []), event]);
  }

  return <div className="space-y-6">
    <PageHeading eyebrow="Workspace / Event stream" title="Activity" description="Verified GitHub webhook deliveries processed for connected repositories." action={<ActionButton onClick={() => void load()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</ActionButton>} />
    {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}
    <div className="flex flex-col gap-3 rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--surface))] p-3 sm:flex-row sm:items-center"><label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--canvas))] px-3"><Search className="h-3.5 w-3.5 text-[rgb(var(--muted))]" /><span className="sr-only">Filter events</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search event, repository, or action" className="min-w-0 flex-1 bg-transparent text-xs outline-none" /></label><SelectControl label="Event type" value={eventType} onChange={setEventType} options={[{ label: "All event types", value: "all" }, ...eventTypes.map((type) => ({ label: type.replaceAll("_", " "), value: type }))]} /><span className="px-1 text-[10px] text-[rgb(var(--muted))]">{events.length} events</span></div>
    {loading ? <Surface><TableSkeleton rows={7} /></Surface> : !events.length ? <EmptyState title={data?.recentEvents.length ? "No events match" : "No GitHub events yet"} description={data?.recentEvents.length ? "Change the event filter or search text." : "Events will appear here after GitHub delivers webhooks for your connected repositories."} action={!data?.recentEvents.length ? <ActionButton href="/dashboard/settings/github">Review GitHub connection</ActionButton> : undefined} /> : <Surface><div className="divide-y divide-[rgb(var(--line))]">{[...days.entries()].map(([day, items]) => <section key={day}><h2 className="sticky top-[62px] z-10 bg-[rgb(var(--surface-raised))] px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))] sm:px-5">{day}</h2><div className="divide-y divide-[rgb(var(--line))]">{items.map((event) => <div key={event.id} className="flex gap-3 px-4 py-3.5 sm:px-5"><span className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[rgb(var(--surface-raised))] text-[rgb(var(--cyan))]"><Activity className="h-3.5 w-3.5" /></span><div className="min-w-0 flex-1"><p className="text-xs font-medium">{event.title}</p><p className="mt-1 text-[11px] text-[rgb(var(--muted))]">{event.repository} · {event.eventType.replaceAll("_", " ")}{event.action ? ` · ${event.action}` : ""}</p>{event.description ? <p className="mt-1 truncate text-[10px] text-[rgb(var(--muted))]">{event.description}</p> : null}</div><time dateTime={event.occurredAt} className="shrink-0 pt-0.5 text-[10px] text-[rgb(var(--muted))]">{new Date(event.occurredAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</time></div>)}</div></section>)}</div><p className="border-t border-[rgb(var(--line))] px-4 py-3 text-[10px] text-[rgb(var(--muted))] sm:px-5">Showing the most recent {data?.recentEvents.length ?? 0} webhook events available from the API.</p></Surface>}
  </div>;
}
