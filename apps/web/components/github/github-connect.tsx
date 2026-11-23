"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownWideNarrow, ArrowUpDown, Check, ExternalLink, Filter, GitBranch, Pin, Plus, RefreshCw, Search, Sparkles, Unplug } from "lucide-react";
import { apiRequest, type AIInsightResult, type Installation, type Repository } from "@/lib/dashboard-api";
import { ActionButton, EmptyState, ErrorNotice, PageHeading, TableDensityToggle, TableSkeleton } from "@/components/dashboard/screen-kit";

type SortBy = "name" | "language" | "visibility" | "recent";

export function GitHubConnect() {
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [query, setQuery] = useState("");
  const [visibility, setVisibility] = useState("all");
  const [sortBy, setSortBy] = useState<SortBy>("name");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const [pinned, setPinned] = useState<string[]>([]);
  const [savedFilter, setSavedFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [githubConfigured, setGithubConfigured] = useState<boolean | null>(null);
  const [aiInsights, setAiInsights] = useState<Record<string, AIInsightResult>>({});
  const [aiLoading, setAiLoading] = useState<Record<string, boolean>>({});

  const loadRepositories = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [configuration, result] = await Promise.all([
        apiRequest<{ configured: boolean }>("/github/configuration"),
        apiRequest<Repository[]>("/github/repositories"),
      ]);
      setGithubConfigured(configuration.configured);
      setRepositories(result);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load repositories");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    void loadRepositories();
    setPinned(JSON.parse(window.localStorage.getItem("devscope-pinned-repositories") ?? "[]") as string[]);
    setSavedFilter(window.localStorage.getItem("devscope-repository-filter") ?? "");
    const params = new URLSearchParams(window.location.search);
    const callbackResult = params.get("github");
    if (callbackResult === "connected") setNotice("GitHub installation updated. Repository access is now synced.");
    if (params.get("error")) setError("GitHub could not complete the installation. Check the API log and try connecting again.");
  }, [loadRepositories]);

  async function refreshFromGitHub() {
    setRefreshing(true);
    setError(null);
    try {
      const installations = await apiRequest<Installation[]>("/github/installations");
      await Promise.all(installations.filter((item) => item.status === "ACTIVE").map((item) =>
        apiRequest<void>(`/github/installations/${item.installationId}/refresh`, { method: "POST" }),
      ));
      await loadRepositories();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to refresh repositories from GitHub");
    } finally { setRefreshing(false); }
  }

  async function connect() {
    setConnecting(true);
    setError(null);
    try {
      const result = await apiRequest<{ url: string }>("/github/install/start");
      window.location.assign(result.url);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start GitHub connection");
      setConnecting(false);
    }
  }

  async function disconnect(repository: Repository) {
    if (!window.confirm(`Disconnect ${repository.fullName} from this workspace?`)) return;
    setError(null);
    try {
      await apiRequest(`/github/repositories/${repository.id}`, { method: "DELETE" });
      setRepositories((current) => current.filter((item) => item.id !== repository.id));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to disconnect repository");
    }
  }

  async function loadAIInsight(repository: Repository, regenerate = false) {
    setAiLoading((current) => ({ ...current, [repository.id]: true }));
    setError(null);
    try {
      const insight = await apiRequest<AIInsightResult>(
        `/ai-insights/repositories/${repository.id}${regenerate ? "/regenerate" : ""}`,
        regenerate ? { method: "POST" } : undefined,
      );
      setAiInsights((current) => ({ ...current, [repository.id]: insight }));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to generate AI insights");
    } finally {
      setAiLoading((current) => ({ ...current, [repository.id]: false }));
    }
  }

  function togglePin(repositoryId: string) {
    setPinned((current) => {
      const next = current.includes(repositoryId) ? current.filter((id) => id !== repositoryId) : [...current, repositoryId];
      window.localStorage.setItem("devscope-pinned-repositories", JSON.stringify(next));
      return next;
    });
  }

  function saveFilter() {
    window.localStorage.setItem("devscope-repository-filter", query);
    setSavedFilter(query);
    setNotice(query ? "Filter saved on this browser." : "An empty repository filter was saved.");
  }

  const filtered = useMemo(() => repositories
    .filter((repository) => !query || `${repository.fullName} ${repository.description ?? ""} ${repository.primaryLanguage ?? ""}`.toLowerCase().includes(query.toLowerCase()))
    .filter((repository) => visibility === "all" || repository.visibility === visibility)
    .sort((a, b) => {
      const pinDifference = Number(pinned.includes(b.id)) - Number(pinned.includes(a.id));
      if (pinDifference) return pinDifference;
      if (sortBy === "language") return (a.primaryLanguage ?? "").localeCompare(b.primaryLanguage ?? "");
      if (sortBy === "visibility") return a.visibility.localeCompare(b.visibility);
      if (sortBy === "recent") return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
      return a.fullName.localeCompare(b.fullName);
    }), [repositories, query, visibility, sortBy, pinned]);

  return <div className="space-y-6">
    <PageHeading eyebrow="Workspace / GitHub" title="Repositories" description="Explore the repositories shared with this workspace and manage installation access." action={<>
      <ActionButton onClick={() => void refreshFromGitHub()} disabled={refreshing || loading}><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />Sync access</ActionButton>
      <ActionButton onClick={() => void connect()} disabled={connecting} variant="primary"><Plus className="h-3.5 w-3.5" />{connecting ? "Opening GitHub…" : "Connect GitHub"}</ActionButton>
    </>} />

    {notice ? <div className="flex items-center gap-2 rounded-lg border border-[rgb(var(--cyan))]/30 bg-[rgb(var(--cyan))]/5 px-3 py-2.5 text-xs text-[rgb(var(--cyan))]"><Check className="h-3.5 w-3.5" />{notice}<button type="button" onClick={() => setNotice(null)} className="ml-auto text-[10px] underline">Dismiss</button></div> : null}
    {error ? <ErrorNotice message={error} onRetry={() => void loadRepositories()} /> : null}
    {githubConfigured === false ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-xs text-amber-800 dark:text-amber-300">GitHub App credentials are incomplete. Configure the server-only values in <code>.env</code> before connecting.</div> : null}

    <div className="flex flex-col gap-3 rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--surface))] p-3 sm:flex-row sm:items-center">
      <label className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--canvas))] px-3"><Search className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--muted))]" /><span className="sr-only">Search repositories</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Filter by repository, language, or description…" className="min-w-0 flex-1 bg-transparent text-xs outline-none placeholder:text-[rgb(var(--muted))]" /></label>
      <div className="flex flex-wrap items-center gap-2">
        <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[rgb(var(--line))] px-2.5 text-[11px] text-[rgb(var(--muted))]"><Filter className="h-3 w-3" /><span className="sr-only">Visibility</span><select value={visibility} onChange={(event) => setVisibility(event.target.value)} aria-label="Visibility" className="bg-transparent text-xs text-[rgb(var(--ink))]"><option value="all">All visibility</option><option value="public">Public</option><option value="private">Private</option></select></label>
        <label className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[rgb(var(--line))] px-2.5 text-[11px] text-[rgb(var(--muted))]"><ArrowUpDown className="h-3 w-3" /><span className="sr-only">Sort repositories</span><select value={sortBy} onChange={(event) => setSortBy(event.target.value as SortBy)} aria-label="Sort repositories" className="max-w-32 bg-transparent text-xs text-[rgb(var(--ink))]"><option value="name">Name</option><option value="recent">Recently synced</option><option value="language">Language</option><option value="visibility">Visibility</option></select></label>
        <TableDensityToggle value={density} onChange={setDensity} />
        <ActionButton variant="ghost" onClick={saveFilter} title="Save this search in this browser"><Check className="h-3.5 w-3.5" /><span className="hidden sm:inline">Save filter</span></ActionButton>
        {savedFilter ? <button type="button" onClick={() => setQuery(savedFilter)} className="max-w-32 truncate text-[10px] text-[rgb(var(--accent))]" title={`Restore saved filter: ${savedFilter}`}>Saved: {savedFilter}</button> : null}
      </div>
    </div>

    <div className="flex items-center justify-between text-[11px] text-[rgb(var(--muted))]"><span>{loading ? "Loading repositories…" : `${filtered.length} of ${repositories.length} repositories`}</span>{pinned.length ? <span className="inline-flex items-center gap-1"><Pin className="h-3 w-3" />Pinned repositories sort first</span> : null}</div>

    {!loading && filtered.length ? <div className="space-y-3">{filtered.map((repository) => {
      const insight = aiInsights[repository.id];
      const generating = aiLoading[repository.id];
      return <div key={`insight-${repository.id}`} className="rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--surface))] p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-[rgb(var(--accent))]" /><p className="text-xs font-semibold">AI insights · {repository.fullName}</p></div>
            {insight ? <p className="mt-2 max-w-3xl text-xs leading-5 text-[rgb(var(--muted))]">{insight.output.summary}</p> : <p className="mt-2 text-xs text-[rgb(var(--muted))]">Generate an evidence-backed summary from backend-calculated metrics.</p>}
          </div>
          <ActionButton onClick={() => void loadAIInsight(repository, Boolean(insight))} disabled={Boolean(generating)} variant="ghost">
            <Sparkles className={`h-3.5 w-3.5 ${generating ? "animate-pulse" : ""}`} />
            {generating ? "Working…" : insight ? "Regenerate" : "Generate"}
          </ActionButton>
        </div>
        {insight ? <div className="mt-4 grid gap-3 lg:grid-cols-3">
          <div className="rounded-lg border border-[rgb(var(--line))] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Observations</p><div className="mt-2 space-y-2">{insight.output.keyObservations.length ? insight.output.keyObservations.map((item, index) => <p key={index} className="text-[11px] leading-5"><span>{item.text}</span><span className="mt-1 block font-mono text-[9px] text-[rgb(var(--muted))]">Evidence: {item.evidenceIds.join(", ")}</span></p>) : <p className="text-[11px] text-[rgb(var(--muted))]">No determined observations.</p>}</div></div>
          <div className="rounded-lg border border-[rgb(var(--line))] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Potential risks</p><div className="mt-2 space-y-2">{insight.output.potentialRisks.length ? insight.output.potentialRisks.map((item, index) => <p key={index} className="text-[11px] leading-5"><span>{item.text}</span><span className="mt-1 block font-mono text-[9px] text-[rgb(var(--muted))]">Evidence: {item.evidenceIds.join(", ")}</span></p>) : <p className="text-[11px] text-[rgb(var(--muted))]">No evidence-backed risks identified.</p>}</div></div>
          <div className="rounded-lg border border-[rgb(var(--line))] p-3"><p className="text-[10px] font-semibold uppercase tracking-wide text-[rgb(var(--muted))]">Recommended actions</p><div className="mt-2 space-y-2">{insight.output.recommendedActions.length ? insight.output.recommendedActions.map((item, index) => <p key={index} className="text-[11px] leading-5"><span>{item.text}</span><span className="mt-1 block font-mono text-[9px] text-[rgb(var(--muted))]">Evidence: {item.evidenceIds.join(", ")}</span></p>) : <p className="text-[11px] text-[rgb(var(--muted))]">No additional actions determined.</p>}</div></div>
        </div> : null}
        {insight ? <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] text-[rgb(var(--muted))]"><p>{insight.output.confidenceOrDataCompleteness}</p><p>{insight.provider} · {insight.model} · {new Date(insight.generatedAt).toLocaleString()} · {insight.cached ? "cached" : "generated"} · <a href={`https://github.com/${repository.fullName}`} target="_blank" rel="noreferrer" className="text-[rgb(var(--accent))]">GitHub repository</a></p></div> : null}
      </div>;
    })}</div> : null}

    {loading ? <div className="overflow-hidden rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--surface))]"><TableSkeleton rows={7} /></div> : repositories.length === 0 ? <EmptyState title="No repositories connected" description="Connect the GitHub App, grant read access to repositories, and sync the installation to add them to this workspace." action={<ActionButton onClick={() => void connect()} variant="primary"><Plus className="h-3.5 w-3.5" />Connect GitHub</ActionButton>} /> : filtered.length === 0 ? <EmptyState title="No repositories match" description="Try a different search or visibility filter." action={<ActionButton onClick={() => { setQuery(""); setVisibility("all"); }}><ArrowDownWideNarrow className="h-3.5 w-3.5" />Clear filters</ActionButton>} /> : <div className="overflow-hidden rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--surface))]"><div className="workspace-scrollbar overflow-x-auto"><table className="w-full min-w-[740px] border-collapse text-left"><thead><tr className="border-b border-[rgb(var(--line))] bg-[rgb(var(--surface-raised))] text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]"><th className="w-10 px-3 py-3"><span className="sr-only">Pinned</span></th><th className="px-2 py-3 font-medium">Repository</th><th className="px-3 py-3 font-medium">Language</th><th className="px-3 py-3 font-medium">Visibility</th><th className="px-3 py-3 font-medium">Default branch</th><th className="px-3 py-3 text-right font-medium">Actions</th></tr></thead><tbody>{filtered.map((repository) => <tr key={repository.id} className={`border-b border-[rgb(var(--line))] last:border-0 hover:bg-[rgb(var(--surface-raised))] ${density === "compact" ? "h-11" : "h-[66px]"}`}>
      <td className="px-3"><button type="button" onClick={() => togglePin(repository.id)} className={`grid h-7 w-7 place-items-center rounded-md ${pinned.includes(repository.id) ? "text-[rgb(var(--accent))]" : "text-[rgb(var(--muted))] hover:text-[rgb(var(--ink))]"}`} aria-label={pinned.includes(repository.id) ? `Unpin ${repository.fullName}` : `Pin ${repository.fullName}`} aria-pressed={pinned.includes(repository.id)}><Pin className="h-3.5 w-3.5" /></button></td>
      <td className="max-w-[360px] px-2"><div className="flex min-w-0 items-center gap-2"><GitBranch className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--muted))]" /><div className="min-w-0"><a href={`https://github.com/${repository.fullName}`} target="_blank" rel="noreferrer" className="block truncate text-xs font-semibold hover:text-[rgb(var(--accent))]">{repository.fullName}</a>{density === "comfortable" && repository.description ? <p className="mt-1 truncate text-[10px] text-[rgb(var(--muted))]">{repository.description}</p> : null}</div></div></td>
      <td className="px-3 text-xs text-[rgb(var(--muted))]">{repository.primaryLanguage ?? "—"}</td><td className="px-3 text-xs capitalize text-[rgb(var(--muted))]">{repository.visibility}</td><td className="px-3 font-mono text-[11px] text-[rgb(var(--muted))]">{repository.defaultBranch ?? "—"}</td><td className="px-3"><div className="flex justify-end gap-1"><a href={`https://github.com/${repository.fullName}`} target="_blank" rel="noreferrer" className="grid h-8 w-8 place-items-center rounded-md text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-raised))] hover:text-[rgb(var(--ink))]" title="Open on GitHub" aria-label={`Open ${repository.fullName} on GitHub`}><ExternalLink className="h-3.5 w-3.5" /></a><button type="button" onClick={() => void disconnect(repository)} className="grid h-8 w-8 place-items-center rounded-md text-[rgb(var(--muted))] hover:bg-rose-500/10 hover:text-rose-600" title="Disconnect repository" aria-label={`Disconnect ${repository.fullName}`}><Unplug className="h-3.5 w-3.5" /></button></div></td>
    </tr>)}</tbody></table></div></div>}
  </div>;
}
