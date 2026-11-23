"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Github, Plus, RefreshCw } from "lucide-react";
import { apiRequest, type Installation } from "@/lib/dashboard-api";
import { ActionButton, EmptyState, ErrorNotice, HealthTag, PageHeading, SectionHeading, Surface, TableSkeleton } from "@/components/dashboard/screen-kit";

export function GitHubAccountsScreen() {
  const [installations, setInstallations] = useState<Installation[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setInstallations(await apiRequest<Installation[]>("/github/installations")); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load GitHub installations"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function refresh(installation: Installation) {
    setBusy(installation.id); setError(null);
    try {
      await apiRequest<void>(`/github/installations/${installation.installationId}/refresh`, { method: "POST" });
      await load();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to refresh this installation"); }
    finally { setBusy(null); }
  }

  return <div className="space-y-6">
    <PageHeading eyebrow="Workspace / Connections" title="GitHub accounts" description="Manage GitHub App installations and repository access granted to this workspace." action={<>
      <ActionButton onClick={() => void load()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</ActionButton>
      <ActionButton href="/dashboard/repositories" variant="primary"><Plus className="h-3.5 w-3.5" />Connect account</ActionButton>
    </>} />
    {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}
    {loading ? <Surface><TableSkeleton rows={4} /></Surface> : installations.length === 0 ? <EmptyState title="No GitHub installations" description="Connect a GitHub account and grant DevScope access to one or more repositories. You can revoke access at any time from GitHub settings." action={<ActionButton href="/dashboard/repositories" variant="primary"><Github className="h-3.5 w-3.5" />Connect GitHub</ActionButton>} /> : <div className="space-y-4">{installations.map((installation) => <Surface key={installation.id}>
      <div className="flex flex-col gap-4 border-b border-[rgb(var(--line))] p-4 sm:flex-row sm:items-center sm:p-5"><span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--surface-raised))]"><Github className="h-5 w-5" /></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h2 className="text-sm font-semibold">{installation.accountLogin}</h2><HealthTag status={installation.status} /><span className="rounded-full border border-[rgb(var(--line))] px-2 py-1 text-[10px] capitalize text-[rgb(var(--muted))]">{installation.accountType}</span></div><p className="mt-1 truncate text-[11px] text-[rgb(var(--muted))]">Installation {installation.installationId} · {installation.repositorySelection} repository access · {installation.repositories.length} repositories</p></div><div className="flex items-center gap-2"><ActionButton onClick={() => void refresh(installation)} disabled={busy === installation.id}><RefreshCw className={`h-3.5 w-3.5 ${busy === installation.id ? "animate-spin" : ""}`} />Sync repositories</ActionButton><a href={`https://github.com/settings/installations/${installation.installationId}`} target="_blank" rel="noreferrer" className="grid h-9 w-9 place-items-center rounded-lg border border-[rgb(var(--line))] text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-raised))]" title="Manage installation on GitHub" aria-label={`Manage ${installation.accountLogin} installation on GitHub`}><ExternalLink className="h-3.5 w-3.5" /></a></div></div>
      <div className="flex flex-wrap gap-2 p-4 sm:px-5">{installation.repositories.slice(0, 10).map((repository) => <a key={repository.id} href={`https://github.com/${repository.fullName}`} target="_blank" rel="noreferrer" className="rounded-md border border-[rgb(var(--line))] px-2.5 py-1.5 text-[10px] text-[rgb(var(--muted))] hover:text-[rgb(var(--accent))]">{repository.fullName}</a>)}{installation.repositories.length > 10 ? <span className="px-2 py-1.5 text-[10px] text-[rgb(var(--muted))]">+{installation.repositories.length - 10} more</span> : null}</div>
    </Surface>)}</div>}
    <Surface className="p-4 sm:p-5"><SectionHeading title="Access model" /><p className="mt-2 max-w-3xl text-xs leading-5 text-[rgb(var(--muted))]">DevScope uses a GitHub App installation. Repository permissions are read-only, and access is limited to the repositories selected in GitHub. Update or uninstall the app from GitHub at any time.</p></Surface>
  </div>;
}
