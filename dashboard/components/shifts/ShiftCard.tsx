"use client";

import Link from "next/link";
import { CalendarDays, MapPin, Users, ChevronRight } from "lucide-react";
import type { Shift } from "@/lib/api";
import { coverage, fmtShiftWindow, fmtRelative, humanize, shiftPhase, shiftStatusMeta } from "@/lib/format";
import { Badge, Chip, ProgressBar, cx } from "@/components/ui";
import { useNow } from "@/lib/hooks";

export function CoverageMeter({ shift, showLabel = true, size = "md" }: { shift: Shift; showLabel?: boolean; size?: "sm" | "md" }) {
  const c = coverage(shift);
  const tone = c.pct >= 100 ? "success" : c.pct >= 50 ? "warning" : c.required === 0 ? "neutral" : "danger";
  return (
    <div>
      {showLabel && (
        <div className="mb-1 flex items-center justify-between text-xs">
          <span className="text-slate-500">
            <span className="font-semibold text-slate-900 tabular">{c.committed}</span>
            <span className="text-slate-400">/{c.required}</span> confirmed
          </span>
          <span className="text-slate-500 tabular">
            {c.pending > 0 && <span className="mr-2">{c.pending} pending</span>}
            {c.noShows > 0 && <span className="text-rose-600">{c.noShows} no-show</span>}
          </span>
        </div>
      )}
      <ProgressBar value={c.pct} tone={tone} size={size} />
    </div>
  );
}

export function PhasePill({ shift }: { shift: Shift }) {
  const now = useNow(30_000);
  const phase = shiftPhase(shift, now);
  if (phase === "live") return <Badge tone="violet" dot>Happening now</Badge>;
  if (phase === "today") return <Badge tone="info" dot>Today · {fmtRelative(shift.start_time, now)}</Badge>;
  if (phase === "past") return <Badge tone="neutral">Ended {fmtRelative(shift.end_time, now)}</Badge>;
  return <Badge tone="neutral">Starts {fmtRelative(shift.start_time, now)}</Badge>;
}

export function ShiftCard({ shift, className }: { shift: Shift; className?: string }) {
  const status = shiftStatusMeta(shift.status);
  return (
    <Link
      href={`/shifts/${encodeURIComponent(shift.id)}`}
      className={cx("card card-hover block p-4 group focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400", className)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-900">{shift.program_name}</h3>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1">
              <CalendarDays className="h-3.5 w-3.5 text-slate-400" /> {fmtShiftWindow(shift)}
            </span>
            <span className="inline-flex items-center gap-1 truncate">
              <MapPin className="h-3.5 w-3.5 text-slate-400" /> {shift.location}
            </span>
            <span className="inline-flex items-center gap-1">
              <Users className="h-3.5 w-3.5 text-slate-400" /> {shift.required_volunteers} needed
            </span>
          </div>
        </div>
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
      </div>

      <div className="mt-3">
        <CoverageMeter shift={shift} />
      </div>

      {(shift.required_skills?.length ?? 0) > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {shift.required_skills.slice(0, 4).map((s) => (
            <Chip key={s}>{humanize(s)}</Chip>
          ))}
          {shift.required_skills.length > 4 && <Chip>+{shift.required_skills.length - 4}</Chip>}
          <span className="flex-1" />
          <PhasePill shift={shift} />
        </div>
      )}
    </Link>
  );
}

export function LifecycleTrail({ shift }: { shift: Shift }) {
  const steps: Array<{ label: string; done: boolean }> = [
    { label: "Scheduled", done: !!shift.scheduled_at || (shift.assigned_volunteers?.length ?? 0) > 0 },
    { label: "48h reminder", done: !!shift.reminder_48h_sent },
    { label: "2h reminder", done: !!shift.reminder_2h_sent },
    { label: "No-show check", done: !!shift.no_show_checked },
    { label: "Hours tracked", done: !!shift.hours_tracked },
  ];
  return (
    <ol className="flex flex-wrap items-center gap-x-1 gap-y-2">
      {steps.map((s, i) => (
        <li key={s.label} className="flex items-center">
          <span
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
              s.done ? "bg-brand-50 text-brand-700 ring-brand-200" : "bg-white text-slate-400 ring-slate-200",
            )}
          >
            <span className={cx("h-1.5 w-1.5 rounded-full", s.done ? "bg-brand-500" : "bg-slate-300")} />
            {s.label}
          </span>
          {i < steps.length - 1 && <span className={cx("mx-1 h-px w-4", s.done ? "bg-brand-300" : "bg-slate-200")} />}
        </li>
      ))}
    </ol>
  );
}
