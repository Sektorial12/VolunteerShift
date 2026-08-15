export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface Shift {
  id: string;
  program_name: string;
  start_time: string;
  end_time: string;
  location: string;
  required_skills: string[];
  required_volunteers: number;
  assigned_volunteers: Assignment[];
  status: string;
  scheduled_at?: string;
  reminder_48h_sent?: boolean;
  reminder_2h_sent?: boolean;
  no_show_checked?: boolean;
  hours_tracked?: boolean;
}

export interface Assignment {
  volunteer_id: string;
  status: string;
  confirmed_at?: string | null;
  checked_in_at?: string | null;
  checked_out_at?: string | null;
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
  status: string;
  preferred_channels: string[];
  notes: string;
}

export interface Communication {
  id: string;
  shift_id: string;
  volunteer_id: string;
  channel: string;
  message_type: string;
  content: string;
  sent_at: string;
  response?: string;
}

export interface Report {
  id: string;
  period: string;
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
  tool_input: string;
  result: string;
}

export async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<T>;
}