"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  Activity, BarChart3, Bell, Building2, Check, ChevronDown, CircleDot, Command,
  FileClock, GitBranch, GitPullRequest, Github, LayoutDashboard, Menu, PanelLeftClose,
  PanelLeftOpen, Plus, Search, Settings2, SlidersHorizontal, Users, X,
} from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiRequest, type Intelligence, type Repository } from "@/lib/dashboard-api";
import { ensureDemoSession } from "@/lib/devscope-auth";

const groups = [
  {
    label: "Workspace",
    items: [
      { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
      { label: "Repositories", href: "/dashboard/repositories", icon: GitBranch },
      { label: "Intelligence", href: "/dashboard/intelligence", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Engineering",
    items: [
      { label: "Pull requests", href: "/dashboard/pull-requests", icon: GitPullRequest },
      { label: "Issues", href: "/dashboard/issues", icon: CircleDot },
      { label: "Analytics", href: "/dashboard/analytics", icon: BarChart3 },
      { label: "Weekly reports", href: "/dashboard/reports", icon: FileClock },
      { label: "Activity", href: "/dashboard/activity", icon: Activity },
    ],
  },
];

const settingsLinks = [
  { label: "Workspace settings", href: "/dashboard/settings" },
  { label: "GitHub accounts", href: "/dashboard/settings/github" },
  { label: "Profile", href: "/dashboard/profile" },
  { label: "Billing", href: "/dashboard/settings/billing" },
];

type Props = { children: React.ReactNode };

export function WorkspaceShell({ children }: Props) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [repositories, setRepositories] = useState<Repository[]>([]);
  const [intelligence, setIntelligence] = useState<Intelligence | null>(null);
  const [workspaceName, setWorkspaceName] = useState("DevScope workspace");
  const [userName, setUserName] = useState("Demo user");
  const [email, setEmail] = useState("");

  useEffect(() => {
    setCollapsed(window.localStorage.getItem("devscope-sidebar-collapsed") === "true");
    void ensureDemoSession().then((session) => {
      setWorkspaceName(session.workspaceName);
      setUserName(session.userName);
      setEmail(session.email);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
        setMobileOpen(false);
      }
      if (event.key === "Escape") {
        setSearchOpen(false);
        setNotificationsOpen(false);
        setProfileOpen(false);
        setWorkspaceOpen(false);
        setMobileOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    if (!searchOpen || repositories.length) return;
    void apiRequest<Repository[]>("/github/repositories").then(setRepositories).catch(() => setRepositories([]));
  }, [searchOpen, repositories.length]);

  useEffect(() => {
    if (!notificationsOpen || intelligence) return;
    void apiRequest<Intelligence>("/github/intelligence").then(setIntelligence).catch(() => setIntelligence({ repositories: [], recentEvents: [] }));
  }, [notificationsOpen, intelligence]);

  const searchResults = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pages = [
      ...groups.flatMap((group) => group.items),
      ...settingsLinks.map((item) => ({ ...item, icon: Settings2 })),
      { label: "Connect GitHub", href: "/dashboard/repositories", icon: Plus },
    ].filter((item) => !needle || item.label.toLowerCase().includes(needle));
    const repos = repositories
      .filter((repository) => !needle || repository.fullName.toLowerCase().includes(needle))
      .slice(0, 6);
    return { pages: pages.slice(0, 7), repos };
  }, [query, repositories]);

  function toggleSidebar() {
    setCollapsed((current) => {
      window.localStorage.setItem("devscope-sidebar-collapsed", String(!current));
      return !current;
    });
  }

  function openSearch() {
    setQuery("");
    setSearchOpen(true);
  }

  const initials = userName.trim().split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase();
  const sidebarWidth = collapsed ? "72px" : "240px";

  return (
    <div className="min-h-screen bg-[rgb(var(--canvas))] text-[rgb(var(--ink))] [--sidebar-width:240px] lg:[--sidebar-width:var(--shell-sidebar-width)]" style={{ "--shell-sidebar-width": sidebarWidth } as React.CSSProperties}>
      <aside className={`fixed inset-y-0 left-0 z-40 flex w-[280px] flex-col border-r border-[rgb(var(--line))] bg-[rgb(var(--surface))] transition-transform duration-200 lg:w-[var(--sidebar-width)] lg:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"}`} aria-label="Main navigation">
        <div className="flex h-[62px] shrink-0 items-center gap-3 border-b border-[rgb(var(--line))] px-4">
          <Link href="/dashboard" className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[rgb(var(--accent))] text-white" aria-label="DevScope overview">
            <span className="font-mono text-[13px] font-bold">d.</span>
          </Link>
          {!collapsed ? <span className="text-[14px] font-semibold tracking-[-.02em]">DevScope</span> : null}
          <button type="button" onClick={() => setMobileOpen(false)} className="ml-auto grid h-8 w-8 place-items-center rounded-md text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-raised))] lg:hidden" aria-label="Close navigation"><X className="h-4 w-4" /></button>
        </div>

        <div className="relative border-b border-[rgb(var(--line))] p-3">
          <button type="button" onClick={() => setWorkspaceOpen((open) => !open)} className={`flex h-10 w-full items-center gap-3 rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--surface-raised))] px-2.5 text-left hover:border-[rgb(var(--accent))]/40 ${collapsed ? "justify-center" : ""}`} title={workspaceName} aria-label={`Current workspace: ${workspaceName}`} aria-expanded={workspaceOpen}>
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-[rgb(var(--accent-soft))] text-[rgb(var(--accent))]"><Building2 className="h-3.5 w-3.5" /></span>
            {!collapsed ? <><span className="min-w-0 flex-1 truncate text-xs font-medium">{workspaceName}</span><ChevronDown className="h-3.5 w-3.5 text-[rgb(var(--muted))]" /></> : null}
          </button>
          {workspaceOpen ? <div className={`absolute top-[calc(100%-4px)] z-50 rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--surface))] p-2 shadow-xl shadow-black/10 ${collapsed ? "left-[64px] w-56" : "left-3 right-3"}`}><p className="eyebrow px-2 py-1">Current workspace</p><div className="flex items-center gap-2 rounded-lg bg-[rgb(var(--accent-soft))] px-2 py-2 text-xs font-medium text-[rgb(var(--accent))]"><Check className="h-3.5 w-3.5" /><span className="truncate">{workspaceName}</span></div><p className="px-2 pb-1 pt-2 text-[10px] leading-4 text-[rgb(var(--muted))]">Workspace switching is unavailable in this demo.</p><Link href="/dashboard/settings" onClick={() => setWorkspaceOpen(false)} className="mt-1 block rounded-md px-2 py-2 text-[11px] hover:bg-[rgb(var(--surface-raised))]">Workspace settings</Link></div> : null}
        </div>

        <nav className="workspace-scrollbar flex-1 space-y-5 overflow-y-auto px-2.5 py-4">
          {groups.map((group) => (
            <div key={group.label}>
              {!collapsed ? <p className="eyebrow mb-2 px-2.5">{group.label}</p> : null}
              <div className="space-y-0.5">
                {group.items.map(({ label, href, icon: Icon }) => {
                  const active = href === "/dashboard" ? pathname === href : pathname.startsWith(href);
                  return <Link key={href} href={href} onClick={() => setMobileOpen(false)} title={collapsed ? label : undefined} aria-label={collapsed ? label : undefined} aria-current={active ? "page" : undefined} className={`group flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13px] transition ${collapsed ? "justify-center" : ""} ${active ? "bg-[rgb(var(--accent-soft))] font-medium text-[rgb(var(--accent))]" : "text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-raised))] hover:text-[rgb(var(--ink))]"}`}>
                    <Icon className="h-[17px] w-[17px] shrink-0" strokeWidth={1.8} /><span className={collapsed ? "sr-only" : ""}>{label}</span>
                  </Link>;
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className="space-y-1 border-t border-[rgb(var(--line))] p-2.5">
          <Link href="/dashboard/settings" onClick={() => setMobileOpen(false)} className={`flex h-9 items-center gap-3 rounded-lg px-2.5 text-[13px] text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-raised))] hover:text-[rgb(var(--ink))] ${pathname.startsWith("/dashboard/settings") ? "bg-[rgb(var(--surface-raised))] text-[rgb(var(--ink))]" : ""}`} title={collapsed ? "Settings" : undefined}>
            <Settings2 className="h-[17px] w-[17px] shrink-0" /><span className={collapsed ? "sr-only" : ""}>Settings</span>
          </Link>
          <button type="button" onClick={toggleSidebar} className={`hidden h-9 w-full items-center gap-3 rounded-lg px-2.5 text-[13px] text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-raised))] lg:flex ${collapsed ? "justify-center" : ""}`} aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}>
            {collapsed ? <PanelLeftOpen className="h-[17px] w-[17px]" /> : <><PanelLeftClose className="h-[17px] w-[17px]" /><span>Collapse sidebar</span></>}
          </button>
        </div>
      </aside>

      {mobileOpen ? <button type="button" className="fixed inset-0 z-30 bg-black/35 lg:hidden" aria-label="Close navigation overlay" onClick={() => setMobileOpen(false)} /> : null}

      <header className="fixed inset-x-0 top-0 z-20 flex h-[62px] items-center justify-between border-b border-[rgb(var(--line))] bg-[rgb(var(--surface))]/95 px-3 backdrop-blur-md lg:left-[var(--sidebar-width)] lg:px-5">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <button type="button" onClick={() => setMobileOpen(true)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-raised))] lg:hidden" aria-label="Open navigation"><Menu className="h-4 w-4" /></button>
          <button type="button" onClick={openSearch} className="flex h-9 w-full max-w-[420px] items-center gap-2.5 rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--canvas))] px-3 text-left text-[13px] text-[rgb(var(--muted))] hover:border-[rgb(var(--accent))]/50" aria-label="Search workspace, press Control or Command K">
            <Search className="h-4 w-4 shrink-0" /><span className="flex-1 truncate">Search pages and repositories…</span><kbd className="hidden rounded border border-[rgb(var(--line))] bg-[rgb(var(--surface))] px-1.5 py-0.5 font-mono text-[10px] sm:inline-flex">Ctrl K</kbd>
          </button>
        </div>
        <div className="ml-3 flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => setNotificationsOpen(true)} className="relative grid h-9 w-9 place-items-center rounded-lg text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-raised))]" aria-label="Open recent GitHub activity">
            <Bell className="h-[17px] w-[17px]" />{intelligence?.recentEvents.length ? <span className="absolute right-[7px] top-[7px] h-1.5 w-1.5 rounded-full bg-[rgb(var(--accent))]" /> : null}
          </button>
          <ThemeToggle />
          <div className="relative ml-1">
            <button type="button" onClick={() => setProfileOpen((open) => !open)} className="flex h-9 items-center gap-2 rounded-lg pl-1 pr-0.5 hover:bg-[rgb(var(--surface-raised))]" aria-expanded={profileOpen} aria-label="Open profile menu">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-[rgb(var(--surface-raised))] text-[10px] font-semibold text-[rgb(var(--ink))]">{initials || "DS"}</span><ChevronDown className="hidden h-3.5 w-3.5 text-[rgb(var(--muted))] sm:block" />
            </button>
            {profileOpen ? <div className="absolute right-0 top-11 z-30 w-56 rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--surface))] p-1.5 shadow-xl shadow-black/10">
              <div className="border-b border-[rgb(var(--line))] px-2.5 py-2"><p className="truncate text-xs font-medium">{userName}</p><p className="mt-0.5 truncate text-[11px] text-[rgb(var(--muted))]">{email}</p></div>
              {settingsLinks.slice(2).map((item) => <Link key={item.href} href={item.href} onClick={() => setProfileOpen(false)} className="block rounded-md px-2.5 py-2 text-xs text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-raised))] hover:text-[rgb(var(--ink))]">{item.label}</Link>)}
            </div> : null}
          </div>
        </div>
      </header>

      <main className="min-h-screen px-4 pb-12 pt-[86px] sm:px-6 lg:pl-[calc(var(--sidebar-width)+24px)] lg:pr-8">
        <div className="mx-auto w-full max-w-[1480px]">{children}</div>
      </main>

      {searchOpen ? <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/35 px-3 pt-[12vh]" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
        <section role="dialog" aria-modal="true" aria-label="Search workspace" className="w-full max-w-[620px] overflow-hidden rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--surface))] shadow-2xl shadow-black/20">
          <div className="flex items-center gap-3 border-b border-[rgb(var(--line))] px-4"><Search className="h-4 w-4 text-[rgb(var(--muted))]" /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search pages and repositories…" className="h-14 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-[rgb(var(--muted))]" /><kbd className="hidden rounded border border-[rgb(var(--line))] px-1.5 py-0.5 font-mono text-[10px] text-[rgb(var(--muted))] sm:block">ESC</kbd></div>
          <div className="max-h-[60vh] overflow-y-auto p-2">
            {searchResults.pages.length ? <p className="eyebrow px-2.5 pb-1 pt-2">Pages</p> : null}
            {searchResults.pages.map(({ label, href, icon: Icon }) => <button key={`${label}:${href}`} type="button" onClick={() => { setSearchOpen(false); router.push(href); }} className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] hover:bg-[rgb(var(--surface-raised))]"><Icon className="h-4 w-4 text-[rgb(var(--muted))]" />{label}<span className="ml-auto text-[11px] text-[rgb(var(--muted))]">Open</span></button>)}
            {searchResults.repos.length ? <p className="eyebrow px-2.5 pb-1 pt-3">Repositories</p> : null}
            {searchResults.repos.map((repository) => <a key={repository.id} href={`https://github.com/${repository.fullName}`} target="_blank" rel="noreferrer" onClick={() => setSearchOpen(false)} className="flex items-center gap-3 rounded-lg px-2.5 py-2 text-[13px] hover:bg-[rgb(var(--surface-raised))]"><Github className="h-4 w-4 text-[rgb(var(--muted))]" /><span className="truncate">{repository.fullName}</span><span className="ml-auto text-[11px] text-[rgb(var(--muted))]">GitHub</span></a>)}
            {!searchResults.pages.length && !searchResults.repos.length ? <p className="p-4 text-center text-sm text-[rgb(var(--muted))]">No matching pages or repositories.</p> : null}
          </div>
          <div className="flex items-center gap-4 border-t border-[rgb(var(--line))] px-4 py-2.5 text-[10px] text-[rgb(var(--muted))]"><span><kbd className="rounded border border-[rgb(var(--line))] px-1">Esc</kbd> Close</span><span className="ml-auto inline-flex items-center gap-1"><Command className="h-3 w-3" /> Quick search</span></div>
        </section>
      </div> : null}

      {notificationsOpen ? <div className="fixed inset-0 z-40 bg-black/25" onMouseDown={(event) => { if (event.target === event.currentTarget) setNotificationsOpen(false); }}>
        <aside role="dialog" aria-modal="true" aria-label="Recent GitHub activity" className="absolute bottom-0 right-0 top-0 flex w-full max-w-[420px] flex-col border-l border-[rgb(var(--line))] bg-[rgb(var(--surface))] shadow-2xl">
          <div className="flex h-[62px] items-center justify-between border-b border-[rgb(var(--line))] px-5"><div><p className="text-sm font-semibold">Recent activity</p><p className="mt-0.5 text-[11px] text-[rgb(var(--muted))]">Verified GitHub webhook events</p></div><button type="button" onClick={() => setNotificationsOpen(false)} aria-label="Close notifications" className="grid h-8 w-8 place-items-center rounded-md hover:bg-[rgb(var(--surface-raised))]"><X className="h-4 w-4" /></button></div>
          <div className="workspace-scrollbar flex-1 overflow-y-auto">
            {intelligence?.recentEvents.length ? intelligence.recentEvents.map((event) => <div key={event.id} className="border-b border-[rgb(var(--line))] px-5 py-4"><div className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[rgb(var(--accent))]" /><div className="min-w-0"><p className="text-[13px] font-medium">{event.title}</p><p className="mt-1 text-xs text-[rgb(var(--muted))]">{event.repository} · {event.eventType.replaceAll("_", " ")}{event.action ? ` · ${event.action}` : ""}</p><p className="mt-2 text-[11px] text-[rgb(var(--muted))]">{new Date(event.occurredAt).toLocaleString()}</p></div></div></div>) : <div className="grid h-64 place-items-center px-6 text-center"><div><Check className="mx-auto h-5 w-5 text-[rgb(var(--muted))]" /><p className="mt-3 text-sm font-medium">You’re all caught up</p><p className="mt-1 text-xs text-[rgb(var(--muted))]">New GitHub events will appear here when delivered.</p></div></div>}
          </div>
          <Link href="/dashboard/activity" onClick={() => setNotificationsOpen(false)} className="border-t border-[rgb(var(--line))] px-5 py-3 text-xs font-medium text-[rgb(var(--accent))] hover:bg-[rgb(var(--surface-raised))]">View activity history</Link>
        </aside>
      </div> : null}
    </div>
  );
}
