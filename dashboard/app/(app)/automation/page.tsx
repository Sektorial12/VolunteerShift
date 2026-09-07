"use client";

import { useEffect, useState } from "react";
import { Bell, CalendarCheck, Clock, FileBarChart, LifeBuoy, Play, RefreshCw, Settings2, Timer, Zap } from "lucide-react";
import { api, type AutomationRunResult } from "@/lib/api";
import { usePolling, useNow, errMessage } from "@/lib/hooks";
import { fmtDateTime, fmtRelative } from "@/lib/format";
import { Badge, Button, Card, CardHeader, Dot, ErrorState, PageHeader, Skeleton, cx } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

const RULES = [
  { icon: CalendarCheck, agent: "Scheduler", when: "As soon as a shift is created", does: "Match, assign and invite volunteers.", tone: "info" as const },
  { icon: Bell, agent: "Communicator", when: "48 hours before start", does: "Reminder to every confirmed volunteer.", tone: "violet" as const },
  { icon: Bell, agent: "Communicator", when: "2 hours before start", does: "Final reminder with location details.", tone: "violet" as const },
  { icon: LifeBuoy, agent: "Recovery", when: "15 minutes after start", does: "Detect no-shows, contact replacements, alert the coordinator.", tone: "warning" as const },
  { icon: Clock, agent: "Tracker", when: "After the shift ends", does: "Log hours, update reliability scores.", tone: "success" as const },
  { icon: FileBarChart, agent: "Reporter", when: "On demand", does: "Weekly coverage and impact report.", tone: "neutral" as const },
];

export default function AutomationPage() {
  const { data, error, loading, refreshing, reload, updatedAt } = usePolling(() => api.automationStatus(), 5_000);
  const now = useNow(1_000);
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [last, setLast] = useState<AutomationRunResult | null>(null);
  const [lastAt, setLastAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);

  // Countdown to the next worker tick (approximate: we only know the interval).
  useEffect(() => {
    if (!data?.interval_seconds) return;
    setTick((t) => t + 1);
  }, [updatedAt, data?.interval_seconds]);
  const secondsIntoCycle = data?.interval_seconds ? Math.floor(((now / 1000) % data.interval_seconds) + tick * 0) : 0;
  const secondsLeft = data?.interval_seconds ? data.interval_seconds - secondsIntoCycle : 0;

  const runNow = async () => {
    setRunning(true);
    try {
      const res = await api.automationRun();
      setLast(res);
      setLastAt(Date.now());
      toast.success(`Automation cycle ran ${res.ran} action${res.ran === 1 ? "" : "s"}`);
    } catch (e) {
      toast.error("Automation run failed", errMessage(e));
    } finally {
      setRunning(false);
    }
  };

  const clockDrift = data ? new Date(data.clock).getTime() - now : 0;

  return (
    <>
      <PageHeader
        eyebrow="Automation"
        title="The agent on a schedule"
        description="A background worker checks every shift against these rules and fires the right agent without anyone clicking."
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={() => void reload()}>
              Refresh
            </Button>
            <Button variant="primary" icon={Play} loading={running} onClick={runNow}>
              Run cycle now
            </Button>
          </>
        }
      />

      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="min-w-0 space-y-6 lg:col-span-2">
          <div className="stagger grid gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-xs font-medium text-slate-500">Worker</p>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-24" />
              ) : (
                <p className="mt-1 flex items-center gap-2 text-2xl font-semibold text-slate-900">
                  <Dot tone={data?.worker_running ? "success" : "danger"} pulse={!!data?.worker_running} />
                  {data?.worker_running ? "Running" : "Stopped"}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">{data?.enabled ? "AUTOMATION_ENABLED=true" : "Automation disabled in config"}</p>
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500">Next check</p>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-24" />
              ) : (
                <p className="mt-1 text-2xl font-semibold tabular text-slate-900">
                  {data?.worker_running ? `~${secondsLeft}s` : "—"}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">Interval {data?.interval_seconds ?? "—"}s</p>
              {data?.worker_running && (
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full bg-brand-500 transition-[width] duration-1000 ease-linear" style={{ width: `${(secondsIntoCycle / (data.interval_seconds || 1)) * 100}%` }} />
                </div>
              )}
            </Card>
            <Card>
              <p className="text-xs font-medium text-slate-500">Agent clock</p>
              {loading ? (
                <Skeleton className="mt-2 h-8 w-24" />
              ) : (
                <p className="mt-1 text-2xl font-semibold tabular text-slate-900">{data?.time_acceleration ?? 1}×</p>
              )}
              <p className="mt-1 truncate text-xs text-slate-500" title={data ? fmtDateTime(data.clock) : ""}>
                {data ? (Math.abs(clockDrift) < 120_000 ? "In sync with real time" : `Agent time ${fmtRelative(data.clock, now)}`) : "—"}
              </p>
            </Card>
          </div>

          <Card>
            <CardHeader icon={Settings2} title="Rules the worker enforces" subtitle="Derived from shift start and end times. Thresholds are set in the backend config." />
            <ul className="divide-y divide-slate-100">
              {RULES.map((r, i) => (
                <li key={i} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                  <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                    <r.icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={r.tone}>{r.agent}</Badge>
                      <span className="text-xs font-medium text-slate-500">{r.when}</span>
                    </div>
                    <p className="mt-0.5 text-sm text-slate-700">{r.does}</p>
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader icon={Zap} title="Manual cycle" subtitle="Runs whatever is due right now, exactly like the worker would." />
            <Button variant="primary" icon={Play} loading={running} onClick={runNow} className="w-full">
              Run automation cycle
            </Button>
            {last && (
              <div className="mt-4">
                <p className="mb-1.5 flex items-center justify-between text-xs text-slate-500">
                  <span>Last manual run</span>
                  <span className="tabular">{lastAt ? fmtRelative(new Date(lastAt).toISOString(), now) : ""}</span>
                </p>
                {last.ran === 0 ? (
                  <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">Nothing was due. The worker already handled everything in its window.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {last.results.map((r, i) => (
                      <li key={i} className={cx("flex items-center justify-between rounded-lg px-3 py-2 text-xs", r.error ? "bg-rose-50 text-rose-700" : "bg-brand-50 text-brand-700")}>
                        <span className="font-medium">{r.action ?? "action"}</span>
                        <span className="font-mono">{r.shift_id ?? ""}</span>
                        <span>{r.error ? "failed" : "ok"}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Card>

          <Card className="bg-slate-900 text-white">
            <div className="flex items-center gap-2">
              <Timer className="h-4 w-4 text-brand-400" />
              <h3 className="text-sm font-semibold">Demo tip</h3>
            </div>
            <p className="mt-2 text-sm text-slate-300">
              Pause the worker while you click through manually, otherwise it will schedule and remind on its own. Set{" "}
              <code className="rounded bg-white/10 px-1 font-mono text-xs">AUTOMATION_ENABLED=false</code> on the backend and restart.
            </p>
          </Card>
        </div>
      </div>
    </>
  );
}
