"use client";

import { Suspense, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { CalendarDays, Clock, LogIn, LogOut, Mail, MapPin, RefreshCw, Users, Bot, Link2, Check } from "lucide-react";
import { api, type AgentAction, type Assignment } from "@/lib/api";
import { usePolling, useNow, errMessage } from "@/lib/hooks";
import { assignmentStatusMeta, coverage, durationHours, fmtDateTime, fmtRelative, fmtShiftWindow, humanize, messageTypeMeta, shiftStatusMeta } from "@/lib/format";
import { Badge, Button, Card, CardHeader, Chip, EmptyState, ErrorState, PageHeader, Skeleton, SkeletonRows, cx } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { AgentActions } from "@/components/agents/AgentActions";
import { CoverageMeter, LifecycleTrail, PhasePill } from "@/components/shifts/ShiftCard";
import { VolunteerName } from "@/components/volunteers/VolunteerDirectory";

const VALID_ACTIONS: AgentAction[] = ["schedule", "remind", "noshow_check", "track"];

export default function ShiftDetailPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 rounded-2xl" />}>
      <ShiftDetail />
    </Suspense>
  );
}

function ShiftDetail() {
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = decodeURIComponent(params.id);
  const runParam = search.get("run");
  const autoRun = VALID_ACTIONS.includes(runParam as AgentAction) ? (runParam as AgentAction) : null;

  const shiftQ = usePolling(() => api.shift(id), 10_000, [id]);
  const commsQ = usePolling(() => api.communications(), 20_000, [id]);
  const now = useNow(30_000);
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const shift = shiftQ.data;
  const comms = useMemo(
    () => (commsQ.data ?? []).filter((c) => c.shift_id === id).sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()),
    [commsQ.data, id],
  );

  const roster = useMemo(() => {
    const order: Record<string, number> = { checked_in: 0, checked_out: 1, confirmed: 2, invited: 3, no_response: 4, replaced: 5, declined: 6, no_show: 7 };
    return [...(shift?.assigned_volunteers ?? [])].sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  }, [shift]);

  const checkInOut = async (a: Assignment, kind: "in" | "out") => {
    setBusy(`${a.volunteer_id}:${kind}`);
    try {
      if (kind === "in") await api.checkIn(id, a.volunteer_id);
      else await api.checkOut(id, a.volunteer_id);
      toast.success(kind === "in" ? "Checked in" : "Checked out");
      await shiftQ.reload();
    } catch (e) {
      toast.error("Could not update attendance", errMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const copyRespondLink = async (volunteerId: string) => {
    const url = `${window.location.origin}/respond?volunteer_id=${encodeURIComponent(volunteerId)}&shift_id=${encodeURIComponent(id)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(volunteerId);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.info("Invitation link", url);
    }
  };

  if (shiftQ.error && !shift) {
    return (
      <>
        <PageHeader backHref="/shifts" backLabel="Shifts" title="Shift" />
        <ErrorState message={shiftQ.error} onRetry={() => void shiftQ.reload()} />
      </>
    );
  }

  if (!shift) {
    return (
      <>
        <PageHeader backHref="/shifts" backLabel="Shifts" title={<Skeleton className="h-8 w-64" />} />
        <div className="grid gap-6 lg:grid-cols-3">
          <Skeleton className="h-96 rounded-2xl lg:col-span-2" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </>
    );
  }

  const status = shiftStatusMeta(shift.status);
  const cov = coverage(shift);

  return (
    <>
      <PageHeader
        backHref="/shifts"
        backLabel="Shifts"
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <span className="font-mono normal-case text-slate-400">{shift.id}</span>
            <PhasePill shift={shift} />
          </span>
        }
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {shift.program_name}
            <Badge tone={status.tone} className="text-sm">
              {status.label}
            </Badge>
          </span>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="h-4 w-4 text-slate-400" /> {fmtShiftWindow(shift)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="h-4 w-4 text-slate-400" /> {durationHours(shift).toFixed(1).replace(/\.0$/, "")}h
            </span>
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-4 w-4 text-slate-400" /> {shift.location}
            </span>
          </span>
        }
        actions={
          <Button variant="secondary" icon={RefreshCw} loading={shiftQ.refreshing} onClick={() => void shiftQ.reload()}>
            Refresh
          </Button>
        }
      />

      <div className="mb-6">
        <LifecycleTrail shift={shift} />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main column */}
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <CardHeader
              icon={Users}
              title={`Roster · ${roster.length} assigned`}
              subtitle={`${cov.committed} of ${cov.required} seats confirmed · ${cov.pending} awaiting reply`}
            />
            {roster.length === 0 ? (
              <EmptyState
                compact
                icon={Users}
                title="No volunteers assigned yet"
                description="Run the Scheduler agent to match and invite the best-fit volunteers."
              />
            ) : (
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
                      <th className="px-5 py-2 font-medium">Volunteer</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Confirmed</th>
                      <th className="px-3 py-2 font-medium">In</th>
                      <th className="px-3 py-2 font-medium">Out</th>
                      <th className="px-5 py-2 text-right font-medium">Attendance</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {roster.map((a) => {
                      const m = assignmentStatusMeta(a.status);
                      const canIn = ["confirmed", "invited", "no_response", "no_show", "replaced"].includes(a.status);
                      const canOut = a.status === "checked_in";
                      return (
                        <tr key={a.volunteer_id} className="hover:bg-slate-50/60">
                          <td className="px-5 py-2.5">
                            <VolunteerName id={a.volunteer_id} />
                          </td>
                          <td className="px-3 py-2.5">
                            <Badge tone={m.tone} dot>
                              {m.label}
                            </Badge>
                          </td>
                          <td className="px-3 py-2.5 text-xs text-slate-500 tabular">{a.confirmed_at ? fmtDateTime(a.confirmed_at) : "—"}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-500 tabular">{a.checked_in_at ? fmtDateTime(a.checked_in_at) : "—"}</td>
                          <td className="px-3 py-2.5 text-xs text-slate-500 tabular">{a.checked_out_at ? fmtDateTime(a.checked_out_at) : "—"}</td>
                          <td className="px-5 py-2.5">
                            <div className="flex items-center justify-end gap-1.5">
                              <Button
                                size="sm"
                                variant="ghost"
                                icon={copied === a.volunteer_id ? Check : Link2}
                                title="Copy the one-tap response link for this volunteer"
                                onClick={() => copyRespondLink(a.volunteer_id)}
                              >
                                {copied === a.volunteer_id ? "Copied" : "Link"}
                              </Button>
                              {canOut ? (
                                <Button size="sm" variant="secondary" icon={LogOut} loading={busy === `${a.volunteer_id}:out`} onClick={() => checkInOut(a, "out")}>
                                  Check out
                                </Button>
                              ) : (
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  icon={LogIn}
                                  disabled={!canIn}
                                  loading={busy === `${a.volunteer_id}:in`}
                                  onClick={() => checkInOut(a, "in")}
                                >
                                  Check in
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              icon={Mail}
              title={`Communications · ${comms.length}`}
              subtitle="Everything the Communicator and Recovery agents sent for this shift"
            />
            {commsQ.loading ? (
              <SkeletonRows rows={3} />
            ) : comms.length === 0 ? (
              <EmptyState compact icon={Mail} title="Nothing sent yet" description="Invitations appear here once the Scheduler assigns people." />
            ) : (
              <ol className="relative space-y-4 before:absolute before:bottom-2 before:left-[15px] before:top-2 before:w-px before:bg-slate-200">
                {comms.map((c) => {
                  const m = messageTypeMeta(c.message_type);
                  return (
                    <li key={c.id} className="relative pl-10">
                      <span className={cx("absolute left-2 top-1 flex h-4 w-4 items-center justify-center rounded-full border-2 border-white ring-1 ring-slate-200", toneBg(m.tone))} />
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge tone={m.tone}>{m.label}</Badge>
                        <span className="text-xs text-slate-500">via {c.channel}</span>
                        <span className="text-xs text-slate-400">·</span>
                        <VolunteerName id={c.volunteer_id} size="sm" subtitle={null} />
                        <span className="ml-auto text-[11px] text-slate-400" title={fmtDateTime(c.sent_at)}>
                          {fmtRelative(c.sent_at, now)}
                        </span>
                      </div>
                      <p className="mt-1.5 whitespace-pre-line rounded-lg bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">{c.content}</p>
                      {c.response && (
                        <p className="mt-1 text-xs text-slate-500">
                          Reply: <span className="font-medium text-slate-700">{humanize(c.response)}</span>
                        </p>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </div>

        {/* Side column */}
        <div className="space-y-6">
          <Card>
            <CardHeader icon={Users} title="Coverage" />
            <div className="flex items-end justify-between">
              <p className="text-4xl font-semibold tracking-tight text-slate-900 tabular">
                {cov.committed}
                <span className="text-xl text-slate-400">/{cov.required}</span>
              </p>
              <p className="text-sm text-slate-500">{cov.pct}% confirmed</p>
            </div>
            <div className="mt-3">
              <CoverageMeter shift={shift} showLabel={false} />
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Row label="Invited, no reply" value={cov.pending} />
              <Row label="Confirmed" value={cov.confirmed} />
              <Row label="Checked in" value={cov.checkedIn} />
              <Row label="Checked out" value={cov.checkedOut} />
              <Row label="Declined" value={cov.declined} />
              <Row label="No-shows" value={cov.noShows} tone={cov.noShows ? "danger" : undefined} />
            </dl>
            {shift.required_skills?.length > 0 && (
              <div className="mt-4 border-t border-slate-100 pt-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Skills required</p>
                <div className="flex flex-wrap gap-1.5">
                  {shift.required_skills.map((s) => (
                    <Chip key={s}>{humanize(s)}</Chip>
                  ))}
                </div>
              </div>
            )}
          </Card>

          <Card>
            <CardHeader icon={Bot} title="Run an agent" subtitle="Manual triggers for the demo. Automation runs these on schedule." />
            <AgentActions shiftId={shift.id} compact autoRun={autoRun} onDone={() => void Promise.all([shiftQ.reload(), commsQ.reload()])} />
          </Card>

          <Card>
            <CardHeader icon={CalendarDays} title="Timeline" />
            <dl className="space-y-2 text-sm">
              <Row label="Scheduled" value={shift.scheduled_at ? fmtDateTime(shift.scheduled_at) : "—"} wide />
              <Row label="Starts" value={fmtDateTime(shift.start_time)} wide />
              <Row label="Ends" value={fmtDateTime(shift.end_time)} wide />
            </dl>
            <Link href="/activity" className="mt-3 inline-block text-xs font-medium text-slate-500 hover:text-slate-900">
              See this shift in the audit trail →
            </Link>
          </Card>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, tone, wide }: { label: string; value: React.ReactNode; tone?: "danger"; wide?: boolean }) {
  return (
    <div className={cx("flex items-center justify-between gap-3", wide && "col-span-2")}>
      <dt className="text-slate-500">{label}</dt>
      <dd className={cx("font-medium tabular", tone === "danger" ? "text-rose-600" : "text-slate-900")}>{value}</dd>
    </div>
  );
}

function toneBg(tone: string) {
  return (
    {
      info: "bg-sky-500",
      success: "bg-brand-500",
      warning: "bg-amber-500",
      danger: "bg-rose-500",
      violet: "bg-violet-500",
      teal: "bg-teal-500",
    } as Record<string, string>
  )[tone] ?? "bg-slate-400";
}

