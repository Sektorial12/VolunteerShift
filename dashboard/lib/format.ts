import type { AgentAction, AssignmentStatus, MessageType, Shift, ShiftStatus } from "./api";

export type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "violet" | "teal";

// ---------- Dates ----------

const dateFmt = new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" });
const timeFmt = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });
const dateTimeFmt = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function safeDate(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function fmtDate(value?: string | null): string {
  const d = safeDate(value);
  return d ? dateFmt.format(d) : "—";
}

export function fmtTime(value?: string | null): string {
  const d = safeDate(value);
  return d ? timeFmt.format(d) : "—";
}

export function fmtDateTime(value?: string | null): string {
  const d = safeDate(value);
  return d ? dateTimeFmt.format(d) : "—";
}

/** "Sat, Sep 7 · 9:00 AM – 1:00 PM" */
export function fmtShiftWindow(shift: Pick<Shift, "start_time" | "end_time">): string {
  const s = safeDate(shift.start_time);
  const e = safeDate(shift.end_time);
  if (!s) return "—";
  const day = dateFmt.format(s);
  const start = timeFmt.format(s);
  const end = e ? timeFmt.format(e) : "";
  return end ? `${day} · ${start} – ${end}` : `${day} · ${start}`;
}

export function fmtRelative(value?: string | null, now: number = Date.now()): string {
  const d = safeDate(value);
  if (!d) return "—";
  const diff = d.getTime() - now;
  const abs = Math.abs(diff);
  const units: Array<[number, Intl.RelativeTimeFormatUnit]> = [
    [1000 * 60 * 60 * 24 * 365, "year"],
    [1000 * 60 * 60 * 24 * 30, "month"],
    [1000 * 60 * 60 * 24 * 7, "week"],
    [1000 * 60 * 60 * 24, "day"],
    [1000 * 60 * 60, "hour"],
    [1000 * 60, "minute"],
  ];
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });
  for (const [ms, unit] of units) {
    if (abs >= ms) return rtf.format(Math.round(diff / ms), unit);
  }
  return abs < 30_000 ? "just now" : rtf.format(Math.round(diff / 1000), "second");
}

export function durationHours(shift: Pick<Shift, "start_time" | "end_time">): number {
  const s = safeDate(shift.start_time);
  const e = safeDate(shift.end_time);
  if (!s || !e) return 0;
  return Math.max(0, (e.getTime() - s.getTime()) / 36e5);
}

// ---------- Labels ----------

export function humanize(value?: string | null): string {
  if (!value) return "—";
  return value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const SHIFT_STATUS_META: Record<ShiftStatus, { label: string; tone: Tone }> = {
  open: { label: "Open", tone: "info" },
  partially_filled: { label: "Partially filled", tone: "warning" },
  filled: { label: "Filled", tone: "success" },
  in_progress: { label: "In progress", tone: "violet" },
  completed: { label: "Completed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export const ASSIGNMENT_STATUS_META: Record<AssignmentStatus, { label: string; tone: Tone }> = {
  invited: { label: "Invited", tone: "neutral" },
  confirmed: { label: "Confirmed", tone: "success" },
  declined: { label: "Declined", tone: "danger" },
  no_response: { label: "No response", tone: "warning" },
  checked_in: { label: "Checked in", tone: "info" },
  checked_out: { label: "Checked out", tone: "teal" },
  no_show: { label: "No-show", tone: "danger" },
  replaced: { label: "Replaced", tone: "violet" },
};

export const MESSAGE_TYPE_META: Record<MessageType, { label: string; tone: Tone }> = {
  invitation: { label: "Invitation", tone: "info" },
  confirmation: { label: "Confirmation", tone: "success" },
  reminder_48h: { label: "48h reminder", tone: "violet" },
  reminder_2h: { label: "2h reminder", tone: "violet" },
  urgent_replacement: { label: "Urgent replacement", tone: "danger" },
  coordinator_notification: { label: "Coordinator alert", tone: "warning" },
};

export const AGENT_ACTIONS: Record<
  AgentAction,
  { label: string; agent: string; description: string; needsShift: boolean; tone: Tone }
> = {
  schedule: {
    label: "Schedule",
    agent: "Scheduler",
    description: "Match volunteers by skill, availability and reliability, then assign and invite.",
    needsShift: true,
    tone: "info",
  },
  remind: {
    label: "Send reminders",
    agent: "Communicator",
    description: "Send 48-hour reminders to every confirmed volunteer on this shift.",
    needsShift: true,
    tone: "violet",
  },
  noshow_check: {
    label: "No-show check",
    agent: "Recovery",
    description: "Detect who has not checked in and find replacements automatically.",
    needsShift: true,
    tone: "warning",
  },
  track: {
    label: "Track hours",
    agent: "Tracker",
    description: "Log hours for everyone who checked out and update reliability scores.",
    needsShift: true,
    tone: "success",
  },
  report: {
    label: "Generate report",
    agent: "Reporter",
    description: "Produce a weekly coverage and impact report.",
    needsShift: false,
    tone: "neutral",
  },
};

export const AGENT_ACTION_ORDER: AgentAction[] = ["schedule", "remind", "noshow_check", "track", "report"];

export function shiftStatusMeta(status: string) {
  return SHIFT_STATUS_META[status as ShiftStatus] ?? { label: humanize(status), tone: "neutral" as Tone };
}
export function assignmentStatusMeta(status: string) {
  return ASSIGNMENT_STATUS_META[status as AssignmentStatus] ?? { label: humanize(status), tone: "neutral" as Tone };
}
export function messageTypeMeta(type: string) {
  return MESSAGE_TYPE_META[type as MessageType] ?? { label: humanize(type), tone: "neutral" as Tone };
}

// Tool name -> which agent owns it (for the activity feed)
export const TOOL_AGENT: Record<string, { agent: string; tone: Tone }> = {
  query_volunteers: { agent: "Scheduler", tone: "info" },
  query_shifts: { agent: "Scheduler", tone: "info" },
  get_shift: { agent: "Scheduler", tone: "info" },
  get_volunteer: { agent: "Scheduler", tone: "info" },
  match_volunteers_to_shifts: { agent: "Scheduler", tone: "info" },
  assign_volunteers_to_shift: { agent: "Scheduler", tone: "info" },
  send_email: { agent: "Communicator", tone: "violet" },
  send_sms: { agent: "Communicator", tone: "violet" },
  log_communication: { agent: "Communicator", tone: "violet" },
  notify_coordinator: { agent: "Communicator", tone: "warning" },
  check_shift_coverage: { agent: "Recovery", tone: "warning" },
  log_hours: { agent: "Tracker", tone: "success" },
  update_volunteer_profile: { agent: "Tracker", tone: "success" },
  generate_report: { agent: "Reporter", tone: "neutral" },
};

export function toolMeta(tool: string) {
  return TOOL_AGENT[tool] ?? { agent: "Agent", tone: "neutral" as Tone };
}

// ---------- Derived shift numbers ----------

export interface Coverage {
  required: number;
  assigned: number;
  confirmed: number;
  checkedIn: number;
  checkedOut: number;
  declined: number;
  noShows: number;
  pending: number;
  /** confirmed + checked in/out, i.e. people actually expected on site */
  committed: number;
  pct: number; // committed / required, clamped 0..100
}

export function coverage(shift: Shift): Coverage {
  const a = shift.assigned_volunteers ?? [];
  const count = (...s: string[]) => a.filter((x) => s.includes(x.status)).length;
  const required = Math.max(0, Number(shift.required_volunteers) || 0);
  const confirmed = count("confirmed");
  const checkedIn = count("checked_in");
  const checkedOut = count("checked_out");
  const committed = confirmed + checkedIn + checkedOut;
  return {
    required,
    assigned: a.length,
    confirmed,
    checkedIn,
    checkedOut,
    declined: count("declined"),
    noShows: count("no_show"),
    pending: count("invited", "no_response"),
    committed,
    pct: required ? Math.min(100, Math.round((committed / required) * 100)) : 0,
  };
}

/** Where a shift sits in its lifecycle right now. */
export function shiftPhase(shift: Shift, now = Date.now()): "upcoming" | "today" | "live" | "past" {
  const s = safeDate(shift.start_time)?.getTime();
  const e = safeDate(shift.end_time)?.getTime();
  if (!s) return "upcoming";
  if (e && now > e) return "past";
  if (now >= s) return "live";
  const d = new Date(s);
  const n = new Date(now);
  const sameDay =
    d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  return sameDay ? "today" : "upcoming";
}

export function initials(name?: string): string {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** Backend rates may be 0..1 or 0..100; normalise to a percent string. */
export function pct(value: unknown, digits = 0): string {
  const n = Number(value) || 0;
  const v = n <= 1 ? n * 100 : n;
  return `${v.toFixed(digits)}%`;
}

export function num(value: unknown, digits = 0): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

/** Parse a JSON string leniently, returning the raw string when it is not JSON. */
export function tryParseJson(raw: unknown): unknown {
  if (typeof raw !== "string") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

/** Audit `result` is json.dumps(str(python_dict)); dig the tool's text payload out. */
export function auditResultText(raw: string): string {
  const once = tryParseJson(raw);
  if (typeof once !== "string") return JSON.stringify(once, null, 2);
  // Python repr: {'toolUseId': ..., 'status': 'success', 'content': [{'text': '{...}'}]}
  const m = once.match(/'text':\s*'((?:\\.|[^'\\])*)'/);
  if (m) {
    const unescaped = m[1]!.replace(/\\"/g, '"').replace(/\\\\/g, "\\").replace(/\\n/g, "\n");
    const inner = tryParseJson(unescaped);
    return typeof inner === "string" ? inner : JSON.stringify(inner, null, 2);
  }
  return once;
}

export function auditStatus(raw: string): "success" | "error" | "unknown" {
  if (/'status':\s*'success'/.test(raw) || /"status":\s*"success"/.test(raw)) return "success";
  if (/'status':\s*'error'/.test(raw) || /"status":\s*"error"/.test(raw)) return "error";
  return "unknown";
}

export function reliabilityTone(score: number): "success" | "warning" | "danger" {
  if (score >= 0.85) return "success";
  if (score >= 0.6) return "warning";
  return "danger";
}
