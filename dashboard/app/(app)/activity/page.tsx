"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Activity, ChevronDown, ChevronRight, Pause, Play, RefreshCw, Search } from "lucide-react";
import { api, type AuditEntry } from "@/lib/api";
import { usePolling, useNow, useDebounced } from "@/lib/hooks";
import { auditResultText, auditStatus, fmtDate, fmtRelative, fmtTime, toolMeta, tryParseJson } from "@/lib/format";
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  PageHeader,
  SegmentedControl,
  SkeletonRows,
  cx,
  inputClass,
  TONE_DOT,
} from "@/components/ui";
import { useVolunteerDirectory } from "@/components/volunteers/VolunteerDirectory";

type AgentFilter = "all" | "Scheduler" | "Communicator" | "Recovery" | "Tracker" | "Reporter";

export default function ActivityPage() {
  const [live, setLive] = useState(true);
  const { data, error, loading, refreshing, reload, updatedAt } = usePolling(() => api.audit(), live ? 8_000 : null);
  const now = useNow(15_000);
  const [agent, setAgent] = useState<AgentFilter>("all");
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim().toLowerCase(), 150);

  const entries = data ?? [];

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of entries) {
      const a = toolMeta(e.tool_name).agent;
      c[a] = (c[a] ?? 0) + 1;
    }
    return c;
  }, [entries]);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      if (agent !== "all" && toolMeta(e.tool_name).agent !== agent) return false;
      if (query && !`${e.tool_name} ${e.tool_input} ${e.result}`.toLowerCase().includes(query)) return false;
      return true;
    });
  }, [entries, agent, query]);

  // Group by calendar day for scannability
  const groups = useMemo(() => {
    const map = new Map<string, AuditEntry[]>();
    for (const e of filtered) {
      const key = fmtDate(e.timestamp);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(e);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <>
      <PageHeader
        eyebrow="Audit trail"
        title="Agent activity"
        description="Every tool the agents call is recorded with its input and result. Nothing happens off the record."
        actions={
          <>
            <Button
              variant={live ? "soft" : "secondary"}
              icon={live ? Pause : Play}
              onClick={() => setLive((l) => !l)}
              title={live ? "Pause live updates" : "Resume live updates"}
            >
              {live ? "Live" : "Paused"}
            </Button>
            <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={() => void reload()}>
              Refresh
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SegmentedControl<AgentFilter>
          value={agent}
          onChange={setAgent}
          options={[
            { value: "all", label: "All", count: entries.length },
            { value: "Scheduler", label: "Scheduler", count: counts.Scheduler ?? 0 },
            { value: "Communicator", label: "Communicator", count: counts.Communicator ?? 0 },
            { value: "Recovery", label: "Recovery", count: counts.Recovery ?? 0 },
            { value: "Tracker", label: "Tracker", count: counts.Tracker ?? 0 },
            { value: "Reporter", label: "Reporter", count: counts.Reporter ?? 0 },
          ]}
        />
        <div className="relative sm:ml-auto sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className={cx(inputClass, "pl-8")}
            placeholder="Search tool, shift id, volunteer…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
      </div>

      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}

      {loading ? (
        <Card>
          <SkeletonRows rows={8} />
        </Card>
      ) : filtered.length === 0 ? (
        <Card>
          <EmptyState
            icon={Activity}
            title={entries.length === 0 ? "No agent activity yet" : "No matches"}
            description={
              entries.length === 0
                ? "Trigger an agent from a shift page and its tool calls will stream in here."
                : "Try a different agent filter or search term."
            }
          />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {day}
                <span className="h-px flex-1 bg-slate-200" />
                <span className="tabular font-medium normal-case text-slate-400">{items.length} calls</span>
              </h2>
              <Card padded={false} className="divide-y divide-slate-100">
                {items.map((e) => (
                  <AuditRow key={e.id} entry={e} now={now} />
                ))}
              </Card>
            </section>
          ))}
          {updatedAt && (
            <p className="text-center text-xs text-slate-400">
              Showing the latest {entries.length} calls · updated {fmtRelative(new Date(updatedAt).toISOString(), now)}
            </p>
          )}
        </div>
      )}
    </>
  );
}

function AuditRow({ entry, now }: { entry: AuditEntry; now: number }) {
  const [open, setOpen] = useState(false);
  const meta = toolMeta(entry.tool_name);
  const status = auditStatus(entry.result);
  const { name } = useVolunteerDirectory();

  const input = tryParseJson(entry.tool_input);
  const inputObj = input && typeof input === "object" ? (input as Record<string, unknown>) : null;
  const shiftId = typeof inputObj?.shift_id === "string" ? (inputObj.shift_id as string) : undefined;
  const volunteerId = typeof inputObj?.volunteer_id === "string" ? (inputObj.volunteer_id as string) : undefined;
  const to = typeof inputObj?.to === "string" ? (inputObj.to as string) : undefined;

  const summary = summarize(entry.tool_name, inputObj);

  return (
    <div className="px-4 py-3">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-start gap-3 text-left">
        <span className={cx("mt-1.5 h-2 w-2 shrink-0 rounded-full", TONE_DOT[meta.tone])} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-xs font-semibold text-slate-900">{entry.tool_name}</code>
            <Badge tone={meta.tone}>{meta.agent}</Badge>
            {status === "error" && <Badge tone="danger">error</Badge>}
            <span className="ml-auto text-[11px] tabular text-slate-400" title={new Date(entry.timestamp).toLocaleString()}>
              {fmtTime(entry.timestamp)} · {fmtRelative(entry.timestamp, now)}
            </span>
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {summary}
            {shiftId && (
              <>
                {" · "}
                <Link href={`/shifts/${encodeURIComponent(shiftId)}`} className="text-slate-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                  {shiftId}
                </Link>
              </>
            )}
            {volunteerId && (
              <>
                {" · "}
                <Link href={`/volunteers/${encodeURIComponent(volunteerId)}`} className="text-slate-700 hover:underline" onClick={(e) => e.stopPropagation()}>
                  {name(volunteerId)}
                </Link>
              </>
            )}
            {to && <> · to {to}</>}
          </p>
        </div>
        <span className="mt-0.5 text-slate-400">{open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</span>
      </button>

      {open && (
        <div className="mt-3 grid gap-3 pl-5 md:grid-cols-2">
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Input</p>
            <pre className="scroll-thin max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 font-mono text-[11px] leading-relaxed text-slate-700">
              {typeof input === "string" ? input : JSON.stringify(input, null, 2)}
            </pre>
          </div>
          <div>
            <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Result</p>
            <pre
              className={cx(
                "scroll-thin max-h-64 overflow-auto whitespace-pre-wrap rounded-lg p-3 font-mono text-[11px] leading-relaxed",
                status === "error" ? "bg-rose-50 text-rose-700" : "bg-slate-900 text-slate-100",
              )}
            >
              {auditResultText(entry.result)}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}

function summarize(tool: string, input: Record<string, unknown> | null): string {
  if (!input) return "";
  switch (tool) {
    case "send_email":
      return typeof input.subject === "string" ? `“${input.subject}”` : "Email";
    case "send_sms":
      return typeof input.message === "string" ? truncate(input.message as string, 80) : "SMS";
    case "log_communication":
      return `${String(input.message_type ?? "message").replace(/_/g, " ")} via ${String(input.channel ?? "")}`;
    case "assign_volunteers_to_shift": {
      const ids = Array.isArray(input.volunteer_ids) ? (input.volunteer_ids as unknown[]).length : undefined;
      return ids !== undefined ? `Assigned ${ids} volunteer${ids === 1 ? "" : "s"}` : "Assigned volunteers";
    }
    case "log_hours":
      return typeof input.hours === "number" ? `${input.hours} hours logged` : "Hours logged";
    case "generate_report":
      return `${String(input.period ?? "")} report ${String(input.start_date ?? "")} → ${String(input.end_date ?? "")}`;
    case "check_shift_coverage":
      return "Checked check-ins vs. confirmations";
    case "match_volunteers_to_shifts":
      return "Ranked candidates by skill, availability, reliability";
    case "notify_coordinator":
      return typeof input.message === "string" ? truncate(input.message as string, 80) : "Coordinator notified";
    default: {
      const keys = Object.keys(input);
      return keys.length ? keys.map((k) => `${k}=${short(input[k])}`).join(" · ") : "";
    }
  }
}

function short(v: unknown): string {
  if (typeof v === "string") return truncate(v, 24);
  if (Array.isArray(v)) return `[${v.length}]`;
  if (v && typeof v === "object") return "{…}";
  return String(v);
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
