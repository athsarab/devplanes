import type { ReactNode } from "react";

export function PageHeading({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return <div className="mb-7 flex flex-col gap-4 border-b border-[rgb(var(--line))] pb-5 sm:flex-row sm:items-end sm:justify-between">
    <div className="min-w-0"><p className="eyebrow">{eyebrow}</p><h1 className="mt-2 text-[25px] font-semibold tracking-[-.035em] sm:text-[29px]">{title}</h1>{description ? <p className="mt-2 max-w-2xl text-[13px] leading-5 text-[rgb(var(--muted))]">{description}</p> : null}</div>
    {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
  </div>;
}

export function SectionHeading({ title, detail, action }: { title: string; detail?: string; action?: ReactNode }) {
  return <div className="mb-3 flex items-center justify-between gap-3"><div className="min-w-0"><h2 className="text-[13px] font-semibold tracking-[-.01em]">{title}</h2>{detail ? <p className="mt-1 text-xs text-[rgb(var(--muted))]">{detail}</p> : null}</div>{action}</div>;
}

export function ActionButton({
  children,
  onClick,
  href,
  variant = "quiet",
  disabled,
  title,
}: {
  children: ReactNode;
  onClick?: () => void;
  href?: string;
  variant?: "primary" | "quiet" | "ghost";
  disabled?: boolean;
  title?: string;
}) {
  const classes = `inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgb(var(--accent))]/50 disabled:cursor-not-allowed disabled:opacity-50 ${variant === "primary" ? "bg-[rgb(var(--accent))] text-white hover:brightness-105" : variant === "quiet" ? "border border-[rgb(var(--line))] bg-[rgb(var(--surface))] text-[rgb(var(--ink))] hover:bg-[rgb(var(--surface-raised))]" : "text-[rgb(var(--muted))] hover:bg-[rgb(var(--surface-raised))] hover:text-[rgb(var(--ink))]"}`;
  if (href) return <a href={href} className={classes} title={title}>{children}</a>;
  return <button type="button" onClick={onClick} className={classes} disabled={disabled} title={title}>{children}</button>;
}

export function SelectControl({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: Array<{ label: string; value: string }> }) {
  return <label className="flex h-9 items-center gap-2 rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--surface))] px-2.5 text-xs text-[rgb(var(--muted))]">
    <span className="sr-only">{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)} className="max-w-full cursor-pointer appearance-none bg-transparent pr-3 text-xs text-[rgb(var(--ink))] outline-none">{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
  </label>;
}

export function StatStrip({ items }: { items: Array<{ label: string; value: number | string; note?: string }> }) {
  return <div className="grid grid-cols-2 divide-x divide-y divide-[rgb(var(--line))] overflow-hidden rounded-xl border border-[rgb(var(--line))] bg-[rgb(var(--surface))] sm:grid-cols-4 sm:divide-y-0 lg:grid-cols-4">{items.map((item) => <div key={item.label} className="px-4 py-4 sm:px-5"><p className="text-[11px] font-medium text-[rgb(var(--muted))]">{item.label}</p><p className="mt-2 text-[22px] font-semibold leading-none tracking-[-.04em] tabular-nums">{item.value}</p>{item.note ? <p className="mt-2 text-[10px] text-[rgb(var(--muted))]">{item.note}</p> : null}</div>)}</div>;
}

export function Surface({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <section className={`surface-panel min-w-0 ${className}`}>{children}</section>;
}

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="grid min-h-[260px] place-items-center rounded-xl border border-dashed border-[rgb(var(--line))] bg-[rgb(var(--surface))] px-6 py-12 text-center"><div className="max-w-sm"><div className="mx-auto h-8 w-8 rounded-[10px] border border-[rgb(var(--line))] bg-[rgb(var(--surface-raised))]" /><h2 className="mt-4 text-sm font-semibold">{title}</h2><p className="mt-2 text-xs leading-5 text-[rgb(var(--muted))]">{description}</p>{action ? <div className="mt-4 flex justify-center">{action}</div> : null}</div></div>;
}

export function ErrorNotice({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div role="alert" className="flex flex-col gap-3 rounded-xl border border-rose-300/50 bg-rose-50 px-4 py-3 text-xs text-rose-800 dark:bg-rose-950/20 dark:text-rose-200 sm:flex-row sm:items-center sm:justify-between"><span>{message}</span>{onRetry ? <button type="button" onClick={onRetry} className="shrink-0 font-semibold underline underline-offset-2">Try again</button> : null}</div>;
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return <div className="animate-pulse divide-y divide-[rgb(var(--line))]">{Array.from({ length: rows }, (_, index) => <div key={index} className="flex h-[58px] items-center gap-4 px-4"><span className="h-3 w-32 rounded bg-[rgb(var(--surface-raised))]" /><span className="h-3 flex-1 rounded bg-[rgb(var(--surface-raised))]" /><span className="h-3 w-16 rounded bg-[rgb(var(--surface-raised))]" /></div>)}</div>;
}

export function HealthTag({ status }: { status: string }) {
  const tone = status === "HEALTHY" || status === "ACTIVE" || status === "open" || status === "merged"
    ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
    : status === "WATCH" || status === "PENDING" || status === "draft"
      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
      : status === "AT_RISK" || status === "SUSPENDED" || status === "closed"
        ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
        : "bg-[rgb(var(--surface-raised))] text-[rgb(var(--muted))]";
  return <span className={`inline-flex items-center rounded-full px-2 py-1 text-[10px] font-medium ${tone}`}>{status.replaceAll("_", " ").toLowerCase()}</span>;
}

export function TableDensityToggle({ value, onChange }: { value: "comfortable" | "compact"; onChange: (value: "comfortable" | "compact") => void }) {
  return <div className="inline-flex h-9 items-center rounded-lg border border-[rgb(var(--line))] bg-[rgb(var(--surface))] p-0.5" aria-label="Table density">
    {(["comfortable", "compact"] as const).map((density) => <button key={density} type="button" aria-pressed={value === density} onClick={() => onChange(density)} className={`rounded-md px-2 py-1 text-[10px] capitalize ${value === density ? "bg-[rgb(var(--surface-raised))] text-[rgb(var(--ink))]" : "text-[rgb(var(--muted))]"}`}>{density}</button>)}
  </div>;
}
