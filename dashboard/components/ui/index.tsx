"use client";

import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2, type LucideIcon } from "lucide-react";
import type { Tone } from "@/lib/format";

// ---------- tone palettes ----------

export const TONE_BADGE: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-sky-50 text-sky-700 ring-sky-200",
  success: "bg-brand-50 text-brand-700 ring-brand-200",
  warning: "bg-amber-50 text-amber-700 ring-amber-200",
  danger: "bg-rose-50 text-rose-700 ring-rose-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
  teal: "bg-teal-50 text-teal-700 ring-teal-200",
};

export const TONE_DOT: Record<Tone, string> = {
  neutral: "bg-slate-400",
  info: "bg-sky-500",
  success: "bg-brand-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
};

export const TONE_SOFT: Record<Tone, string> = {
  neutral: "bg-slate-50 text-slate-600",
  info: "bg-sky-50 text-sky-600",
  success: "bg-brand-50 text-brand-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-rose-50 text-rose-600",
  violet: "bg-violet-50 text-violet-600",
  teal: "bg-teal-50 text-teal-600",
};

export const TONE_BAR: Record<Tone, string> = {
  neutral: "bg-slate-400",
  info: "bg-sky-500",
  success: "bg-brand-500",
  warning: "bg-amber-500",
  danger: "bg-rose-500",
  violet: "bg-violet-500",
  teal: "bg-teal-500",
};

export function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

// ---------- primitives ----------

export function Badge({
  tone = "neutral",
  children,
  dot,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  dot?: boolean;
  className?: string;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset whitespace-nowrap",
        TONE_BADGE[tone],
        className,
      )}
    >
      {dot && <span className={cx("h-1.5 w-1.5 rounded-full", TONE_DOT[tone])} />}
      {children}
    </span>
  );
}

export function Dot({ tone = "neutral", pulse }: { tone?: Tone; pulse?: boolean }) {
  return (
    <span className="relative inline-flex h-2 w-2">
      {pulse && (
        <span className={cx("absolute inline-flex h-full w-full rounded-full opacity-60 animate-ping", TONE_DOT[tone])} />
      )}
      <span className={cx("relative inline-flex h-2 w-2 rounded-full", TONE_DOT[tone])} />
    </span>
  );
}

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "soft";
type ButtonSize = "sm" | "md" | "lg";

const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary:
    "bg-slate-900 text-white hover:bg-slate-800 shadow-sm focus-visible:ring-slate-900 disabled:bg-slate-300",
  secondary:
    "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 hover:ring-slate-300 focus-visible:ring-slate-400",
  ghost: "text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-slate-400",
  danger: "bg-rose-600 text-white hover:bg-rose-700 shadow-sm focus-visible:ring-rose-600",
  soft: "bg-brand-50 text-brand-700 hover:bg-brand-100 ring-1 ring-inset ring-brand-200 focus-visible:ring-brand-500",
};

const BTN_SIZE: Record<ButtonSize, string> = {
  sm: "h-8 px-2.5 text-xs gap-1.5 rounded-lg",
  md: "h-9 px-3.5 text-sm gap-2 rounded-lg",
  lg: "h-11 px-5 text-sm gap-2 rounded-xl",
};

export function Button({
  variant = "secondary",
  size = "md",
  loading,
  icon: Icon,
  children,
  className,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      disabled={disabled || loading}
      className={cx(
        "inline-flex items-center justify-center font-medium transition focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60",
        BTN_VARIANT[variant],
        BTN_SIZE[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon ? <Icon className="h-4 w-4" /> : null}
      {children}
    </button>
  );
}

export function Card({
  children,
  className,
  padded = true,
  hover,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
  hover?: boolean;
}) {
  return <div className={cx("card", hover && "card-hover", padded && "p-5", className)}>{children}</div>;
}

export function CardHeader({
  title,
  subtitle,
  icon: Icon,
  action,
  className,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: LucideIcon;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("flex items-start justify-between gap-4 mb-4", className)}>
      <div className="flex items-start gap-2.5 min-w-0">
        {Icon && (
          <span className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
            <Icon className="h-4 w-4" />
          </span>
        )}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-slate-900 leading-6">{title}</h2>
          {subtitle && <p className="text-xs text-slate-500">{subtitle}</p>}
        </div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  description,
  eyebrow,
  actions,
  backHref,
  backLabel,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
      <div className="min-w-0">
        {backHref && (
          <Link
            href={backHref}
            className="mb-2 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900"
          >
            <span aria-hidden>←</span> {backLabel ?? "Back"}
          </Link>
        )}
        {eyebrow && <div className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-500">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 truncate">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
  loading,
  trend,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  loading?: boolean;
  trend?: ReactNode;
}) {
  return (
    <Card className="relative overflow-hidden">
      <div className="flex items-start justify-between">
        <p className="text-xs font-medium text-slate-500">{label}</p>
        {Icon && (
          <span className={cx("inline-flex h-8 w-8 items-center justify-center rounded-lg", TONE_SOFT[tone])}>
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        {loading ? (
          <span className="skeleton h-8 w-20" />
        ) : (
          <span className="text-3xl font-semibold tracking-tight text-slate-900 tabular">{value}</span>
        )}
        {trend}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </Card>
  );
}

export function ProgressBar({
  value,
  tone = "success",
  className,
  size = "md",
}: {
  value: number; // 0..100
  tone?: Tone;
  className?: string;
  size?: "sm" | "md";
}) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={v}
      className={cx("w-full overflow-hidden rounded-full bg-slate-100", size === "sm" ? "h-1.5" : "h-2", className)}
    >
      <div className={cx("h-full rounded-full transition-[width] duration-500", TONE_BAR[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}

export function Avatar({ name, size = "md", className }: { name?: string; size?: "sm" | "md" | "lg"; className?: string }) {
  const text = (name ?? "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
  // deterministic hue from the name
  let h = 0;
  for (const c of name ?? "") h = (h * 31 + c.charCodeAt(0)) % 360;
  const dims = size === "sm" ? "h-7 w-7 text-[11px]" : size === "lg" ? "h-14 w-14 text-lg" : "h-9 w-9 text-xs";
  return (
    <span
      className={cx("inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white", dims, className)}
      style={{ background: `hsl(${h} 45% 45%)` }}
      aria-hidden
    >
      {text || "?"}
    </span>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} />;
}

export function SkeletonRows({ rows = 4, className }: { rows?: number; className?: string }) {
  return (
    <div className={cx("space-y-3", className)}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <Skeleton className="h-9 w-9 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-3 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  compact,
}: {
  icon?: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}) {
  return (
    <div className={cx("flex flex-col items-center justify-center text-center", compact ? "py-8" : "py-16")}>
      {Icon && (
        <span className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">
          <Icon className="h-5 w-5" />
        </span>
      )}
      <p className="text-sm font-medium text-slate-900">{title}</p>
      {description && <p className="mt-1 max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 flex items-start justify-between gap-4">
      <div>
        <p className="font-medium">Something went wrong</p>
        <p className="mt-0.5 text-rose-600/90 break-words">{message}</p>
      </div>
      {onRetry && (
        <Button size="sm" variant="secondary" onClick={onRetry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-slate-200 bg-white px-1 font-mono text-[10px] text-slate-500">
      {children}
    </kbd>
  );
}

export function Chip({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("inline-flex items-center rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600", className)}>
      {children}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
  htmlFor,
}: {
  label: string;
  hint?: string;
  error?: string;
  children: ReactNode;
  htmlFor?: string;
}) {
  return (
    <label htmlFor={htmlFor} className="block">
      <span className="mb-1 block text-xs font-medium text-slate-700">{label}</span>
      {children}
      {error ? (
        <span className="mt-1 block text-xs text-rose-600">{error}</span>
      ) : hint ? (
        <span className="mt-1 block text-xs text-slate-500">{hint}</span>
      ) : null}
    </label>
  );
}

export const inputClass =
  "block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:bg-slate-50";

export function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  size = "sm",
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: ReactNode; count?: number }>;
  size?: "sm" | "md";
}) {
  return (
    <div className="inline-flex rounded-lg bg-slate-100 p-0.5">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-md font-medium transition",
              size === "sm" ? "px-2.5 py-1 text-xs" : "px-3 py-1.5 text-sm",
              active ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800",
            )}
          >
            {o.label}
            {typeof o.count === "number" && (
              <span className={cx("rounded-full px-1.5 text-[10px] tabular", active ? "bg-slate-100 text-slate-600" : "bg-slate-200/70 text-slate-500")}>
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
