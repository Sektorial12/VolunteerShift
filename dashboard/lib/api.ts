/**
 * Shared API contract for the VolunteerShift dashboard.
 *
 * All calls go to the dashboard's own origin ("/api/...") and are proxied to the
 * FastAPI backend by the rewrite in next.config.js. Set NEXT_PUBLIC_API_DIRECT_URL
 * only if you deliberately want the browser to bypass the proxy.
 */

export const API_BASE = (process.env.NEXT_PUBLIC_API_DIRECT_URL || "").replace(/\/$/, "");

// ---------- Entities (mirror src/vshift/models/entities.py) ----------

export type ShiftStatus =
  | "open"
  | "partially_filled"
  | "filled"
  | "in_progress"
  | "completed"
  | "cancelled";

export type AssignmentStatus =
  | "invited"
  | "confirmed"
  | "declined"
  | "no_response"
  | "checked_in"
  | "checked_out"
  | "no_show"
  | "replaced";

export type MessageType =
  | "invitation"
  | "confirmation"
  | "reminder_48h"
  | "reminder_2h"
  | "urgent_replacement"
  | "coordinator_notification";

export type Channel = "email" | "sms" | "dashboard";

export interface Assignment {
  volunteer_id: string;
  status: AssignmentStatus | string;
  confirmed_at?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
}

export interface Shift {
  id: string;
  program_name: string;
  start_time: string;
  end_time: string;
  location: string;
  required_skills: string[];
  required_volunteers: number;
  assigned_volunteers: Assignment[];
  status: ShiftStatus | string;
  scheduled_at?: string | null;
  invitations_sent?: boolean;
  reminder_48h_sent?: boolean;
  reminder_2h_sent?: boolean;
  no_show_checked?: boolean;
  hours_tracked?: boolean;
}

export interface Volunteer {
  id: string;
  name: string;
  email: string;
  phone: string;
  skills: string[];
  availability: Record<string, string[]>;
  reliability_score: number;
  total_hours: number;
  past_shifts: string[];
  status: "active" | "pending" | "inactive" | string;
  preferred_channels: string[];
  notes: string;
}

export interface Communication {
  id: string;
  shift_id: string;
  volunteer_id: string;
  channel: Channel | string;
  message_type: MessageType | string;
  content: string;
  sent_at: string;
  response?: string | null;
  responded_at?: string | null;
}

export interface Report {
  id: string;
  period: "weekly" | "monthly" | string;
  start_date: string;
  end_date: string;
  total_shifts: number;
  total_volunteers: number;
  total_hours: number;
  no_show_rate: number;
  coverage_rate: number;
  generated_at: string;
}

export interface AuditEntry {
  id: string;
  timestamp: string;
  tool_name: string;
  tool_input: string; // JSON string
  result: string; // JSON-encoded string of the tool result
}

export interface DashboardData {
  active_shifts: Shift[];
  recent_communications: Communication[];
  total_shifts: number;
  total_communications: number;
}

export interface AutomationStatus {
  enabled: boolean;
  worker_running: boolean;
  interval_seconds: number;
  time_acceleration: number;
  clock: string;
}

export interface AutomationRunResult {
  ran: number;
  results: Array<{ action?: string; shift_id?: string; result?: string; error?: string }>;
}

export type AgentAction = "schedule" | "remind" | "noshow_check" | "track" | "report";

export interface TriggerResult {
  action: AgentAction;
  result: string;
}

export interface ShiftCreateInput {
  program_name: string;
  start_time: string;
  end_time: string;
  location: string;
  required_skills: string[];
  required_volunteers: number;
}

export interface VolunteerSignupInput {
  name: string;
  email: string;
  phone: string;
  skills: string[];
  availability: Record<string, string[]>;
  preferred_channels: string[];
}

// ---------- Fetch helpers ----------

export class ApiError extends Error {
  status: number;
  detail?: string;
  constructor(status: number, detail?: string) {
    super(detail ? `${detail}` : `HTTP ${status}`);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function parseError(res: Response): Promise<ApiError> {
  let detail: string | undefined;
  try {
    const body = await res.json();
    detail = typeof body?.detail === "string" ? body.detail : JSON.stringify(body?.detail ?? body);
  } catch {
    /* non-JSON body */
  }
  return new ApiError(res.status, detail);
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store", ...init });
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
}

export async function postJson<T>(path: string, body?: unknown): Promise<T> {
  return fetchJson<T>(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

// ---------- Typed endpoints ----------

export const api = {
  ping: () => fetchJson<{ status: string }>("/api/ping"),
  dashboard: () => fetchJson<DashboardData>("/api/dashboard"),
  shifts: () => fetchJson<Shift[]>("/api/shifts"),
  shift: (id: string) => fetchJson<Shift>(`/api/shifts/${encodeURIComponent(id)}`),
  createShift: (input: ShiftCreateInput) =>
    postJson<{ shift_id: string; status: string }>("/api/shifts", input),
  checkIn: (shiftId: string, volunteerId: string) =>
    postJson<{ volunteer_id: string; status: string; time: string }>(
      `/api/shifts/${encodeURIComponent(shiftId)}/checkin`,
      { volunteer_id: volunteerId },
    ),
  checkOut: (shiftId: string, volunteerId: string) =>
    postJson<{ volunteer_id: string; status: string; time: string }>(
      `/api/shifts/${encodeURIComponent(shiftId)}/checkout`,
      { volunteer_id: volunteerId },
    ),
  volunteers: () => fetchJson<Volunteer[]>("/api/volunteers"),
  volunteer: (id: string) => fetchJson<Volunteer>(`/api/volunteers/${encodeURIComponent(id)}`),
  respond: (volunteerId: string, shiftId: string, response: "confirm" | "decline") =>
    postJson<{ volunteer_id: string; shift_id: string; response: string; shift_status: string }>(
      "/api/volunteers/respond",
      { volunteer_id: volunteerId, shift_id: shiftId, response },
    ),
  signupVolunteer: (input: VolunteerSignupInput) =>
    postJson<{ status: string; volunteer_id: string; message?: string }>("/api/ingest/volunteer", input),
  communications: () => fetchJson<Communication[]>("/api/communications"),
  reports: () => fetchJson<Report[]>("/api/reports"),
  report: (id: string) => fetchJson<Report>(`/api/reports/${encodeURIComponent(id)}`),
  audit: () => fetchJson<AuditEntry[]>("/api/audit"),
  trigger: (action: AgentAction, shiftId?: string) =>
    postJson<TriggerResult>("/api/trigger", { action, shift_id: shiftId }),
  automationStatus: () => fetchJson<AutomationStatus>("/api/automation/status"),
  automationRun: () => postJson<AutomationRunResult>("/api/automation/run"),
};
