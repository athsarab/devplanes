"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Building2, CreditCard, Github, ShieldCheck, UserRound, Users } from "lucide-react";
import { apiRequest, type Installation } from "@/lib/dashboard-api";
import { ensureDemoSession } from "@/lib/devscope-auth";
import { PageHeading, SectionHeading, Surface } from "@/components/dashboard/screen-kit";

type BillingSummary = { plan: string; status: string; entitlements: { name: string; repositoryLimit: number; memberLimit: number } };

export function WorkspaceSettingsScreen() {
  const [workspace, setWorkspace] = useState({ name: "DevScope workspace", id: "" });
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [installations, setInstallations] = useState<Installation[]>([]);
  useEffect(() => {
    void ensureDemoSession().then((session) => setWorkspace({ name: session.workspaceName, id: session.workspaceId })).catch(() => undefined);
    void Promise.all([
      apiRequest<BillingSummary>("/billing/subscription").then(setBilling).catch(() => undefined),
      apiRequest<Installation[]>("/github/installations").then(setInstallations).catch(() => undefined),
    ]);
  }, []);

  const rows = [
    { label: "Workspace identity", detail: "Workspace name and current account scope", href: "/dashboard/profile", icon: Building2, value: workspace.name },
    { label: "GitHub connections", detail: "Installed GitHub Apps and repository permissions", href: "/dashboard/settings/github", icon: Github, value: `${installations.length} ${installations.length === 1 ? "account" : "accounts"}` },
    { label: "Plan and billing", detail: "Subscription status and workspace limits", href: "/dashboard/settings/billing", icon: CreditCard, value: billing ? `${billing.entitlements.name} · ${billing.status.toLowerCase()}` : "Open billing" },
    { label: "Team access", detail: "Member invitations are not enabled in this demo", href: "/dashboard/team", icon: Users, value: "Not available" },
  ];

  return <div className="space-y-6">
    <PageHeading eyebrow="Workspace / Configuration" title="Workspace settings" description="Manage the connections and plan attached to this workspace." />
    <Surface>
      <div className="border-b border-[rgb(var(--line))] px-4 py-4 sm:px-5"><SectionHeading title="Workspace overview" detail="Current development workspace" /></div>
      <div className="grid gap-0 sm:grid-cols-2"><div className="border-b border-[rgb(var(--line))] px-4 py-4 sm:border-r sm:px-5"><p className="text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">Workspace name</p><p className="mt-2 text-sm font-medium">{workspace.name}</p></div><div className="border-b border-[rgb(var(--line))] px-4 py-4 sm:px-5"><p className="text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">Workspace ID</p><p className="mt-2 break-all font-mono text-xs text-[rgb(var(--muted))]">{workspace.id || "Loading…"}</p></div><div className="px-4 py-4 sm:col-span-2 sm:px-5"><p className="inline-flex items-center gap-2 text-xs text-[rgb(var(--muted))]"><ShieldCheck className="h-4 w-4 text-[rgb(var(--cyan))]" />GitHub App permissions are read-only and scoped to selected repositories.</p></div></div>
    </Surface>
    <Surface>
      <div className="border-b border-[rgb(var(--line))] px-4 py-4 sm:px-5"><SectionHeading title="Configuration areas" detail="Open an area to manage its current settings." /></div>
      <div className="divide-y divide-[rgb(var(--line))]">{rows.map(({ label, detail, href, icon: Icon, value }) => <Link key={href} href={href} className="flex items-center gap-3 px-4 py-4 hover:bg-[rgb(var(--surface-raised))] sm:px-5"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[rgb(var(--surface-raised))] text-[rgb(var(--muted))]"><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="block text-xs font-medium">{label}</span><span className="mt-1 block text-[10px] text-[rgb(var(--muted))]">{detail}</span></span><span className="hidden max-w-[200px] truncate text-right text-[10px] text-[rgb(var(--muted))] sm:block">{value}</span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-[rgb(var(--muted))]" /></Link>)}</div>
    </Surface>
    <p className="text-[10px] leading-5 text-[rgb(var(--muted))]">This development build currently exposes workspace identity as read-only. Authentication and team-management controls are not connected to the interface yet.</p>
  </div>;
}

export function ProfileScreen() {
  const [profile, setProfile] = useState({ name: "Demo user", email: "", workspace: "DevScope workspace", workspaceId: "" });
  useEffect(() => {
    void ensureDemoSession().then((session) => setProfile({ name: session.userName, email: session.email, workspace: session.workspaceName, workspaceId: session.workspaceId })).catch(() => undefined);
  }, []);
  const initials = profile.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();

  return <div className="space-y-6">
    <PageHeading eyebrow="Account / Identity" title="Profile" description="Account details for the signed-in DevScope session." />
    <Surface>
      <div className="flex flex-col gap-5 border-b border-[rgb(var(--line))] p-5 sm:flex-row sm:items-center sm:p-6"><span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[rgb(var(--accent-soft))] text-lg font-semibold text-[rgb(var(--accent))]">{initials || "DS"}</span><div><h2 className="text-lg font-semibold tracking-tight">{profile.name}</h2><p className="mt-1 text-xs text-[rgb(var(--muted))]">{profile.email || "Email unavailable"}</p></div></div>
      <div className="grid sm:grid-cols-2"><div className="border-b border-[rgb(var(--line))] px-5 py-4 sm:border-r"><p className="text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">Workspace</p><p className="mt-2 text-xs font-medium">{profile.workspace}</p></div><div className="border-b border-[rgb(var(--line))] px-5 py-4"><p className="text-[10px] uppercase tracking-wide text-[rgb(var(--muted))]">Workspace ID</p><p className="mt-2 break-all font-mono text-[10px] text-[rgb(var(--muted))]">{profile.workspaceId || "Loading…"}</p></div><div className="px-5 py-4 sm:col-span-2"><div className="flex items-start gap-3"><UserRound className="mt-0.5 h-4 w-4 text-[rgb(var(--muted))]" /><div><p className="text-xs font-medium">Demo authentication</p><p className="mt-1 max-w-2xl text-[11px] leading-5 text-[rgb(var(--muted))]">This project currently signs you into a shared development workspace using demo authentication. Profile editing, account switching, and production sign-in are not implemented yet.</p></div></div></div></div>
    </Surface>
  </div>;
}
