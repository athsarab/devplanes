"use client";

import { useCallback, useEffect, useState } from "react";
import { CreditCard, ExternalLink, RefreshCw } from "lucide-react";
import { apiRequest } from "@/lib/dashboard-api";
import { ActionButton, ErrorNotice, HealthTag, PageHeading, SectionHeading, Surface } from "@/components/dashboard/screen-kit";

type BillingStatus = {
  plan: "FREE" | "PRO" | "TEAM";
  status: string;
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string | null;
  gracePeriodEndsAt: string | null;
  entitlements: { name: string; repositoryLimit: number; memberLimit: number; advancedAnalytics: boolean; repositoryHealth: boolean; weeklySummaries: boolean; historicalDays: number };
  hasCustomerRecord: boolean;
};

export default function BillingSettingsPage() {
  const [billing, setBilling] = useState<BillingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [action, setAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try { setBilling(await apiRequest<BillingStatus>("/billing/subscription")); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load billing details"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function checkout(plan: "PRO" | "TEAM") {
    setAction(plan); setError(null);
    try {
      const result = await apiRequest<{ url: string }>("/billing/checkout", { method: "POST", body: JSON.stringify({ plan }) });
      window.location.assign(result.url);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to start checkout"); setAction(null); }
  }

  async function portal() {
    setAction("portal"); setError(null);
    try {
      const result = await apiRequest<{ url: string }>("/billing/portal", { method: "POST" });
      window.location.assign(result.url);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to open billing portal"); setAction(null); }
  }

  return <div className="space-y-6">
    <PageHeading eyebrow="Workspace / Plan" title="Subscription & billing" description="Plan status and feature limits applied by the DevScope API." action={<ActionButton onClick={() => void load()} disabled={loading}><RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />Refresh</ActionButton>} />
    {error ? <ErrorNotice message={error} onRetry={() => void load()} /> : null}
    {loading && !billing ? <div className="h-52 animate-pulse rounded-xl bg-[rgb(var(--surface-raised))]" /> : null}
    {billing ? <>
      <Surface className="overflow-hidden"><div className="grid md:grid-cols-[1fr_auto]"><div className="p-5 sm:p-7"><p className="eyebrow">Current plan</p><div className="mt-3 flex flex-wrap items-center gap-3"><h2 className="text-3xl font-semibold tracking-[-.04em]">{billing.entitlements.name}</h2><HealthTag status={billing.status} /></div><p className="mt-3 max-w-xl text-xs leading-5 text-[rgb(var(--muted))]">{billing.cancelAtPeriodEnd ? "Cancellation is scheduled at the end of the current period." : billing.status === "PAST_DUE" ? "Payment needs attention. Review your billing details to avoid interruption." : "Your subscription status is confirmed by the billing service."}</p>{billing.currentPeriodEnd ? <p className="mt-2 text-[10px] text-[rgb(var(--muted))]">Current period ends {new Date(billing.currentPeriodEnd).toLocaleDateString()}</p> : null}{billing.gracePeriodEndsAt ? <p className="mt-1 text-[10px] text-amber-600">Payment grace period ends {new Date(billing.gracePeriodEndsAt).toLocaleDateString()}</p> : null}</div><div className="flex flex-wrap items-center gap-2 border-t border-[rgb(var(--line))] bg-[rgb(var(--surface-raised))] p-5 md:justify-end md:border-l md:border-t-0">{billing.plan === "FREE" ? <><ActionButton onClick={() => void checkout("PRO")} disabled={action !== null} variant="primary">{action === "PRO" ? "Opening checkout…" : "Upgrade to Pro"}</ActionButton><ActionButton onClick={() => void checkout("TEAM")} disabled={action !== null}>{action === "TEAM" ? "Opening checkout…" : "Upgrade to Team"}</ActionButton></> : billing.hasCustomerRecord ? <ActionButton onClick={() => void portal()} disabled={action !== null}><CreditCard className="h-3.5 w-3.5" />{action === "portal" ? "Opening portal…" : "Manage billing"}<ExternalLink className="h-3 w-3" /></ActionButton> : <p className="text-[10px] text-[rgb(var(--muted))]">No billing customer is linked.</p>}</div></div></Surface>
      <Surface><div className="border-b border-[rgb(var(--line))] px-4 py-4 sm:px-5"><SectionHeading title="Plan entitlements" detail="Limits enforced by the API for this workspace" /></div><div className="grid divide-y divide-[rgb(var(--line))] sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-3">{[["Repositories", billing.entitlements.repositoryLimit], ["Members", billing.entitlements.memberLimit], ["History", `${billing.entitlements.historicalDays} days`], ["Repository health", billing.entitlements.repositoryHealth ? "Included" : "Not included"], ["Advanced analytics", billing.entitlements.advancedAnalytics ? "Included" : "Not included"], ["Weekly summaries", billing.entitlements.weeklySummaries ? "Included" : "Not included"]].map(([label, value]) => <div key={String(label)} className="px-4 py-4 sm:border-b sm:border-[rgb(var(--line))] sm:px-5"><p className="text-[10px] text-[rgb(var(--muted))]">{String(label)}</p><p className="mt-2 text-sm font-semibold">{String(value)}</p></div>)}</div></Surface>
      <p className="text-[10px] leading-5 text-[rgb(var(--muted))]">Checkout and billing portal actions require valid Stripe credentials and price IDs in the API environment.</p>
    </> : null}
  </div>;
}
