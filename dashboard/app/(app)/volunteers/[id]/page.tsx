"use client";

import { useMemo } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Clock, Mail, MessageSquare, Phone, ShieldCheck, Star } from "lucide-react";
import { api, type Shift } from "@/lib/api";
import { usePolling, useNow } from "@/lib/hooks";
import { assignmentStatusMeta, fmtDateTime, fmtRelative, fmtShiftWindow, humanize, messageTypeMeta, num, pct, reliabilityTone, shiftPhase } from "@/lib/format";
import { Avatar, Badge, Card, CardHeader, Chip, EmptyState, ErrorState, PageHeader, ProgressBar, Skeleton, SkeletonRows, cx } from "@/components/ui";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

export default function VolunteerDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const vQ = usePolling(() => api.volunteer(id), null, [id]);
  const shiftsQ = usePolling(() => api.shifts(), 30_000, [id]);
  const commsQ = usePolling(() => api.communications(), 30_000, [id]);
  const now = useNow(30_000);

  const v = vQ.data;

  const history = useMemo(() => {
    const all = shiftsQ.data ?? [];
    const rows: Array<{ shift: Shift; status: string }> = [];
    for (const s of all) {
      const a = s.assigned_volunteers?.find((x) => x.volunteer_id === id);
      if (a) rows.push({ shift: s, status: a.status });
    }
    rows.sort((a, b) => new Date(b.shift.start_time).getTime() - new Date(a.shift.start_time).getTime());
    return rows;
  }, [shiftsQ.data, id]);

  const comms = useMemo(
    () => (commsQ.data ?? []).filter((c) => c.volunteer_id === id).sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()),
    [commsQ.data, id],
  );

  if (vQ.error && !v) {
    return (
      <>
        <PageHeader backHref="/volunteers" backLabel="Volunteers" title="Volunteer" />
        <ErrorState message={vQ.error} onRetry={() => void vQ.reload()} />
      </>
    );
  }
  if (!v) {
    return (
      <>
        <PageHeader backHref="/volunteers" backLabel="Volunteers" title={<Skeleton className="h-8 w-56" />} />
        <Skeleton className="h-80 rounded-2xl" />
      </>
    );
  }

  const score = Number(v.reliability_score) || 0;
  const tone = reliabilityTone(score);
  const upcoming = history.filter((h) => shiftPhase(h.shift, now) !== "past" && !["declined", "no_show", "replaced"].includes(h.status));
  const attended = history.filter((h) => ["checked_out", "checked_in"].includes(h.status)).length;
  const noShows = history.filter((h) => h.status === "no_show").length;

  return (
    <>
      <PageHeader
        backHref="/volunteers"
        backLabel="Volunteers"
        eyebrow={<span className="font-mono normal-case text-slate-400">{v.id}</span>}
        title={
          <span className="inline-flex items-center gap-3">
            <Avatar name={v.name} size="lg" />
            <span>
              {v.name}
              <span className="ml-3 align-middle">
                <Badge tone={v.status === "active" ? "success" : v.status === "pending" ? "warning" : "neutral"} dot>
                  {humanize(v.status)}
                </Badge>
              </span>
            </span>
          </span>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
            <a href={`mailto:${v.email}`} className="inline-flex items-center gap-1.5 hover:text-slate-900">
              <Mail className="h-4 w-4 text-slate-400" /> {v.email}
            </a>
            {v.phone && (
              <a href={`tel:${v.phone}`} className="inline-flex items-center gap-1.5 hover:text-slate-900">
                <Phone className="h-4 w-4 text-slate-400" /> {v.phone}
              </a>
            )}
            {v.preferred_channels?.length > 0 && (
              <span className="inline-flex items-center gap-1.5">
                <MessageSquare className="h-4 w-4 text-slate-400" /> prefers {v.preferred_channels.join(", ")}
              </span>
            )}
          </span>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-xs font-medium text-slate-500">Reliability</p>
              <p className={cx("mt-1 text-3xl font-semibold tabular tracking-tight", tone === "danger" ? "text-rose-600" : "text-slate-900")}>{pct(score)}</p>
              <ProgressBar value={score * 100} tone={tone} size="sm" className="mt-2" />
              <p className="mt-1.5 text-[11px] text-slate-500">+2% per attended shift, −10% per no-show</p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500">Hours logged</p>
              <p className="mt-1 text-3xl font-semibold tabular tracking-tight text-slate-900">{num(v.total_hours, 1)}</p>
              <p className="mt-1.5 text-[11px] text-slate-500">{v.past_shifts?.length ?? 0} completed shifts on record</p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500">Attendance</p>
              <p className="mt-1 text-3xl font-semibold tabular tracking-tight text-slate-900">
                {attended}
                <span className="text-base text-slate-400"> attended</span>
              </p>
              <p className={cx("mt-1.5 text-[11px]", noShows ? "text-rose-600" : "text-slate-500")}>
                {noShows} no-show{noShows === 1 ? "" : "s"} across assigned shifts
              </p>
            </Card>
          </div>

          <Card>
            <CardHeader icon={CalendarDays} title={`Shift history · ${history.length}`} subtitle="Every shift this volunteer was assigned to, newest first" />
            {shiftsQ.loading ? (
              <SkeletonRows rows={3} />
            ) : history.length === 0 ? (
              <EmptyState compact icon={CalendarDays} title="No shifts yet" description="The Scheduler agent will match them when a shift needs their skills." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {history.map(({ shift, status }) => {
                  const m = assignmentStatusMeta(status);
                  return (
                    <li key={shift.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                      <div className="min-w-0 flex-1">
                        <Link href={`/shifts/${encodeURIComponent(shift.id)}`} className="block truncate text-sm font-medium text-slate-900 hover:underline">
                          {shift.program_name}
                        </Link>
                        <p className="truncate text-xs text-slate-500">
                          {fmtShiftWindow(shift)} · {shift.location}
                        </p>
                      </div>
                      <Badge tone={m.tone} dot>
                        {m.label}
                      </Badge>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader icon={Mail} title={`Messages · ${comms.length}`} subtitle="What the agents sent this person" />
            {commsQ.loading ? (
              <SkeletonRows rows={2} />
            ) : comms.length === 0 ? (
              <EmptyState compact icon={Mail} title="No messages yet" />
            ) : (
              <ul className="space-y-3">
                {comms.slice(0, 8).map((c) => {
                  const m = messageTypeMeta(c.message_type);
                  return (
                    <li key={c.id} className="rounded-lg border border-slate-100 p-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <Badge tone={m.tone}>{m.label}</Badge>
                        <span className="text-slate-500">via {c.channel}</span>
                        <Link href={`/shifts/${encodeURIComponent(c.shift_id)}`} className="font-mono text-slate-500 hover:underline">
                          {c.shift_id}
                        </Link>
                        <span className="ml-auto text-slate-400" title={fmtDateTime(c.sent_at)}>
                          {fmtRelative(c.sent_at, now)}
                        </span>
                      </div>
                      <p className="mt-1.5 line-clamp-3 whitespace-pre-line text-xs text-slate-700">{c.content}</p>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader icon={Star} title="Skills" />
            {v.skills?.length ? (
              <div className="flex flex-wrap gap-1.5">
                {v.skills.map((s) => (
                  <Chip key={s} className="text-xs">
                    {humanize(s)}
                  </Chip>
                ))}
              </div>
            ) : (
              <p className="text-sm text-slate-500">No skills recorded.</p>
            )}
          </Card>

          <Card>
            <CardHeader icon={Clock} title="Availability" subtitle="Windows the Scheduler agent can book" />
            <ul className="space-y-1.5">
              {DAYS.map((d) => {
                const slots = v.availability?.[d] ?? [];
                return (
                  <li key={d} className="flex items-start justify-between gap-3 text-sm">
                    <span className="w-24 shrink-0 capitalize text-slate-500">{d.slice(0, 3)}</span>
                    {slots.length ? (
                      <span className="flex flex-wrap justify-end gap-1">
                        {slots.map((s) => (
                          <Chip key={s} className="bg-brand-50 text-brand-700">
                            {s}
                          </Chip>
                        ))}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-300">—</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card>
            <CardHeader icon={ShieldCheck} title="Upcoming" />
            {upcoming.length === 0 ? (
              <p className="text-sm text-slate-500">Nothing scheduled.</p>
            ) : (
              <ul className="space-y-2">
                {upcoming.map(({ shift, status }) => (
                  <li key={shift.id} className="text-sm">
                    <Link href={`/shifts/${encodeURIComponent(shift.id)}`} className="font-medium text-slate-900 hover:underline">
                      {shift.program_name}
                    </Link>
                    <p className="text-xs text-slate-500">
                      {fmtShiftWindow(shift)} · {assignmentStatusMeta(status).label}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {v.notes && (
            <Card>
              <CardHeader title="Notes" />
              <p className="whitespace-pre-line text-sm text-slate-700">{v.notes}</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
