import Link from "next/link";
import { Check } from "lucide-react";

const plans = [
  {
    name: "Free",
    price: "$0",
    description: "For individual developers monitoring a small codebase.",
    features: ["3 repositories", "30 days of activity", "Basic issue and PR monitoring", "Recent repository activity"],
  },
  {
    name: "Pro",
    price: "$12",
    description: "For developers who need deeper repository intelligence.",
    features: ["25 repositories", "365 days of activity", "Advanced analytics", "Repository health reports", "Weekly development summaries"],
    featured: true,
  },
  {
    name: "Team",
    price: "$39",
    description: "For engineering teams sharing operational context.",
    features: ["100 repositories", "25 team members", "730 days of activity", "Shared dashboards", "Team analytics and reports"],
  },
];

export default function PricingPage() {
  return (
    <main className="min-h-screen bg-[rgb(var(--canvas))] px-5 py-16 text-[rgb(var(--ink))] sm:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-500">Subscription plans</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight">Repository intelligence that scales with the work.</h1>
          <p className="mt-4 text-sm leading-6 text-[rgb(var(--muted))]">
            Start free, upgrade for deeper history and health reporting, or move to team-wide visibility.
          </p>
        </div>
        <div className="mt-12 grid gap-4 lg:grid-cols-3">
          {plans.map((plan) => (
            <section
              key={plan.name}
              className={`relative rounded-xl border p-6 ${
                plan.featured
                  ? "border-[rgb(var(--accent))]/50 bg-[rgb(var(--surface))] shadow-lg shadow-[rgb(var(--accent))]/[.08]"
                  : "border-[rgb(var(--line))] bg-[rgb(var(--surface))]"
              }`}
            >
              {plan.featured ? (
                <span className="absolute right-5 top-5 rounded-full bg-accent-500/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-accent-500">
                  Recommended
                </span>
              ) : null}
              <h2 className="text-sm font-semibold">{plan.name}</h2>
              <div className="mt-5 flex items-end gap-1">
                <span className="text-4xl font-semibold tracking-tight">{plan.price}</span>
                {plan.name !== "Free" ? <span className="pb-1 text-xs text-[rgb(var(--muted))]">/ month</span> : null}
              </div>
              <p className="mt-4 min-h-12 text-sm leading-6 text-[rgb(var(--muted))]">{plan.description}</p>
              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-center gap-2 text-sm">
                    <Check className="h-4 w-4 text-accent-500" />
                    {feature}
                  </li>
                ))}
              </ul>
              <Link
                href="/dashboard/settings/billing"
                className={`mt-8 flex h-10 items-center justify-center rounded-md text-sm font-medium ${
                  plan.featured
                    ? "bg-accent-500 text-white"
                    : "border border-[rgb(var(--line))] hover:bg-[rgb(var(--surface-raised))]"
                }`}
              >
                {plan.name === "Free" ? "Continue free" : `Choose ${plan.name}`}
              </Link>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
