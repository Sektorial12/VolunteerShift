"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  Mail,
  Plus,
  RefreshCw,
  Users,
  FileText,
} from "lucide-react";
import { api, type AuditEntry, type Shift } from "@/lib/api";
import { usePolling, useNow } from "@/lib/hooks";
import { coverage, fmtRelative, messageTypeMeta, shiftPhase, toolMeta } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  EmptyState,
  ErrorState,
  PageHeader,
  Skeleton,
  SkeletonRows,
  StatCard,
} from "@/components/ui";
import { ShiftCard } from "@/components/shifts/ShiftCard";
import { CreateShiftDialog } from "@/components/shifts/CreateShiftDialog";
import { AgentActions } from "@/components/agents/AgentActions";
import { VolunteerName, useVolunteerDirectory } from "@/components/volunteers/VolunteerDirectory";

export default function DashboardPage() {
  const dash = usePolling(() => api.dashboard(), 8_000);
  const audit = usePolling(() => api.audit(), 10_000);
  const directory = useVolunteerDirectory();
  const now = useNow(15_000);
  const [creating, setCreating] = useState(false);

  const shifts = dash.data?.active_shifts ?? [];

  const derived = useMemo(() => {
    let required = 0;
    let committed = 0;
    const attention: Array<{ shift: Shift; reason: string; tone: "warning" | "danger" }> = [];
    for (const s of shifts) {
      const c = coverage(s);
      required += c.required;
      committed += Math.min(c.committed, c.required);
      const phase = shiftPhase(s, now);
      if (c.noShows > 0) attention.push({ shift: s, reason: `${c.noShows} no-show${c.noShows > 1 ? "s" : ""} detected`, tone: "danger" });
      else if (phase !== "past" && c.committed < c.required) {
        const missing = c.required - c.committed;
        attention.push({
          shift: s,
          reason: `${missing} seat${missing > 1 ? "s" : ""} unconfirmed · ${c.pending} invite${c.pending === 1 ? "" : "s"} pending`,
          tone: phase === "today" || phase === "live" ? "danger" : "warning",
        });
      }
    }
    const upcoming = [...shifts]
      .filter((s) => shiftPhase(s, now) !== "past")
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    return { required, committed, attention: attention.slice(0, 5), upcoming };
  }, [shifts, now]);

  const activeVolunteers = directory.volunteers.filter((v) => v.status === "active").length;
  const recentTools = (audit.data ?? []).slice(0, 8);
  const toolsToday = (audit.data ?? []).filter((a) => now - new Date(a.timestamp).getTime() < 864e5).length;

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Coordination at a glance"
        description={
          dash.updatedAt ? (
            <span className="inline-flex items-center gap-1.5">
              Live · updated {fmtRelative(new Date(dash.updatedAt).toISOString(), now)}
              {dash.refreshing && <RefreshCw className="h-3 w-3 animate-spin text-slate-400" />}
            </span>
          ) : (
            "Connecting to the agent backend…"
          )
        }
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} onClick={() => void dash.reload()} loading={dash.refreshing}>
              Refresh
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              New shift
            </Button>
          </>
        }
      />

      {dash.error && !dash.data && (
        <div className="mb-6">
          <ErrorState message={dash.error} onRetry={() => void dash.reload()} />
        </div>
      )}

      <div className="stagger grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Active shifts"
          value={shifts.length}
          hint={`${dash.data?.total_shifts ?? 0} total on record`}
          icon={CalendarDays}
          tone="info"
          loading={dash.loading}
        />
        <StatCard
          label="Seats confirmed"
          value={
            <>
              {derived.committed}
              <span className="text-lg font-medium text-slate-400">/{derived.required}</span>
            </>
          }
          hint={derived.required ? `${Math.round((derived.committed / derived.required) * 100)}% of required coverage` : "No open seats"}
          icon={Users}
          tone={derived.required && derived.committed >= derived.required ? "success" : "warning"}
          loading={dash.loading}
        />
        <StatCard
          label="Messages sent"
          value={dash.data?.total_communications ?? 0}
          hint="Email + SMS by the Communicator agent"
          icon={Mail}
          tone="violet"
          loading={dash.loading}
        />
        <StatCard
          label="Agent tool calls · 24h"
          value={toolsToday}
          hint={`${activeVolunteers} active volunteers in the pool`}
          icon={Activity}
          tone="success"
          loading={audit.loading}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Left: attention + upcoming */}
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader
              icon={AlertTriangle}
              title="Needs a decision"
              subtitle="The agent handles the rest; these are the only shifts that might need you."
              action={
                derived.attention.length > 0 && <Badge tone={derived.attention.some((a) => a.tone === "danger") ? "danger" : "warning"} dot>{derived.attention.length}</Badge>
              }
            />
            {dash.loading ? (
              <SkeletonRows rows={2} />
            ) : derived.attention.length === 0 ? (
              <EmptyState compact title="Nothing waiting on you" description="Every active shift is covered or already being recovered by the agent." />
            ) : (
              <ul className="divide-y divide-slate-100">
                {derived.attention.map(({ shift, reason, tone }) => (
                  <li key={shift.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${tone === "danger" ? "bg-rose-500" : "bg-amber-500"}`} />
                    <div className="min-w-0 flex-1">
                      <Link href={`/shifts/${encodeURIComponent(shift.id)}`} className="block truncate text-sm font-medium text-slate-900 hover:underline">
                        {shift.program_name}
                      </Link>
                      <p className="truncate text-xs text-slate-500">
                        {reason} · starts {fmtRelative(shift.start_time, now)}
                      </p>
                    </div>
                    <Link
                      href={`/shifts/${encodeURIComponent(shift.id)}`}
                      className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                    >
                      Open <ArrowRight className="h-3 w-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-slate-900">Upcoming shifts</h2>
              <Link href="/shifts" className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
                All shifts <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
            {dash.loading ? (
              <div className="grid gap-3 md:grid-cols-2">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-36 rounded-2xl" />
                ))}
              </div>
            ) : derived.upcoming.length === 0 ? (
              <Card>
                <EmptyState
                  icon={CalendarDays}
                  title="No upcoming shifts"
                  description="Create a shift and the Scheduler agent will start matching volunteers."
                  action={
                    <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                      New shift
                    </Button>
                  }
                />
              </Card>
            ) : (
              <div className="stagger grid gap-3 md:grid-cols-2">
                {derived.upcoming.slice(0, 6).map((s) => (
                  <ShiftCard key={s.id} shift={s} />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Right: live agent feed + comms + report */}
        <div className="space-y-6">
          <Card>
            <CardHeader
              icon={Activity}
              title="Agent activity"
              subtitle="Every tool call, as it happens"
              action={
                <Link href="/activity" className="text-xs font-medium text-slate-500 hover:text-slate-900">
                  View all
                </Link>
              }
            />
            {audit.loading ? (
              <SkeletonRows rows={5} />
            ) : recentTools.length === 0 ? (
              <EmptyState compact icon={Activity} title="No tool calls yet" description="Run an agent on a shift to see it here." />
            ) : (
              <ol className="relative space-y-3 before:absolute before:left-[7px] before:top-2 before:bottom-2 before:w-px before:bg-slate-200">
                {recentTools.map((e) => (
                  <ActivityRow key={e.id} entry={e} now={now} />
                ))}
              </ol>
            )}
          </Card>

          <Card>
            <CardHeader
              icon={Mail}
              title="Recent messages"
              action={
                <Link href="/communications" className="text-xs font-medium text-slate-500 hover:text-slate-900">
                  View all
                </Link>
              }
            />
            {dash.loading ? (
              <SkeletonRows rows={3} />
            ) : (dash.data?.recent_communications.length ?? 0) === 0 ? (
              <EmptyState compact icon={Mail} title="No messages yet" />
            ) : (
              <ul className="space-y-3">
                {dash.data!.recent_communications.slice(0, 5).map((c) => {
                  const m = messageTypeMeta(c.message_type);
                  return (
                    <li key={c.id} className="flex items-start gap-3">
                      <VolunteerName id={c.volunteer_id} size="sm" subtitle={<>{m.label} · {c.channel} · {fmtRelative(c.sent_at, now)}</>} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader icon={FileText} title="Weekly report" subtitle="Ask the Reporter agent for coverage and impact numbers." />
            <AgentActions actions={["report"]} compact />
            <Link href="/reports" className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-900">
              Past reports <ArrowRight className="h-3 w-3" />
            </Link>
          </Card>
        </div>
      </div>

      <CreateShiftDialog open={creating} onClose={() => setCreating(false)} onCreated={() => void dash.reload()} />
    </>
  );
}

function ActivityRow({ entry, now }: { entry: AuditEntry; now: number }) {
  const meta = toolMeta(entry.tool_name);
  let shiftId: string | undefined;
  let volunteerId: string | undefined;
  try {
    const input = JSON.parse(entry.tool_input) as Record<string, unknown>;
    if (typeof input.shift_id === "string") shiftId = input.shift_id;
    if (typeof input.volunteer_id === "string") volunteerId = input.volunteer_id;
  } catch {
    /* ignore */
  }
  return (
    <li className="relative pl-6">
      <span className={`absolute left-0 top-1.5 h-[15px] w-[15px] rounded-full border-2 border-white ring-1 ring-slate-200 ${dotClass(meta.tone)}`} />
      <div className="flex items-center gap-2">
        <code className="truncate font-mono text-xs font-medium text-slate-800">{entry.tool_name}</code>
        <span className="ml-auto shrink-0 text-[11px] text-slate-400 tabular">{fmtRelative(entry.timestamp, now)}</span>
      </div>
      <p className="truncate text-xs text-slate-500">
        {meta.agent} agent
        {shiftId && (
          <>
            {" · "}
            <Link href={`/shifts/${encodeURIComponent(shiftId)}`} className="hover:underline">
              {shiftId}
            </Link>
          </>
        )}
        {volunteerId && <> · <VolunteerIdName id={volunteerId} /></>}
      </p>
    </li>
  );
}

function VolunteerIdName({ id }: { id: string }) {
  const { name } = useVolunteerDirectory();
  return <>{name(id)}</>;
}

function dotClass(tone: string) {
  switch (tone) {
    case "info":
      return "bg-sky-500";
    case "success":
      return "bg-brand-500";
    case "warning":
      return "bg-amber-500";
    case "danger":
      return "bg-rose-500";
    case "violet":
      return "bg-violet-500";
    default:
      return "bg-slate-400";
  }
}
