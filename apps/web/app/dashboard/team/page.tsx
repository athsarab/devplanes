import Link from "next/link";
import { Users } from "lucide-react";
import { PageHeading, Surface } from "@/components/dashboard/screen-kit";

export default function TeamPage() {
  return <div className="space-y-6">
    <PageHeading eyebrow="Workspace / Access" title="Team access" description="Team membership controls are not yet connected in this development build." />
    <Surface className="grid min-h-[280px] place-items-center px-6 py-12 text-center"><div className="max-w-sm"><span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-[rgb(var(--surface-raised))] text-[rgb(var(--muted))]"><Users className="h-5 w-5" /></span><h2 className="mt-4 text-sm font-semibold">No member management yet</h2><p className="mt-2 text-xs leading-5 text-[rgb(var(--muted))]">The API has workspace membership records, but this app does not currently expose invitations or role editing.</p><Link href="/dashboard/settings" className="mt-4 inline-flex text-xs font-medium text-[rgb(var(--accent))]">Back to workspace settings</Link></div></Surface>
  </div>;
}
