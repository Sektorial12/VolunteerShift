"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Activity,
  Calendar,
  Users,
  Mail,
  AlertCircle,
  CheckCircle,
  Clock,
  Plus,
  RefreshCw,
  Play,
} from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface Shift {
  id: string;
  program_name: string;
  start_time: string;
  end_time: string;
  location: string;
  required_skills: string[];
  required_volunteers: number;
  assigned_volunteers: any[];
  status: string;
}

interface Communication {
  id: string;
  shift_id: string;
  volunteer_id: string;
  channel: string;
  message_type: string;
  content: string;
  sent_at: string;
  response?: string;
}

interface DashboardData {
  active_shifts: Shift[];
  recent_communications: Communication[];
  total_shifts: number;
  total_communications: number;
}

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  partially_filled: "bg-yellow-100 text-yellow-700",
  filled: "bg-green-100 text-green-700",
  in_progress: "bg-purple-100 text-purple-700",
  completed: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-700",
};

const messageTypeIcons: Record<string, string> = {
  invitation: "Mail",
  reminder_48h: "Clock",
  reminder_2h: "Clock",
  urgent_replacement: "AlertCircle",
  coordinator_notification: "AlertCircle",
  confirmation: "CheckCircle",
};

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateShift, setShowCreateShift] = useState(false);
  const [triggering, setTriggering] = useState<string | null>(null);
  const [triggerResult, setTriggerResult] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const res = await fetch(`${API_BASE}/api/dashboard`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("Failed to fetch dashboard:", err);
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const handleTrigger = async (action: string, shiftId?: string) => {
    setTriggering(action);
    setTriggerResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, shift_id: shiftId }),
      });
      const json = await res.json();
      setTriggerResult(json.result || JSON.stringify(json));
    } catch (err) {
      setTriggerResult(`Error: ${err}`);
    } finally {
      setTriggering(null);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <RefreshCw className="w-8 h-8 animate-spin text-brand-600" />
        <p className="text-sm text-gray-500">Loading dashboard from {API_BASE}...</p>
        {error && <p className="text-sm text-red-600">Error: {error}</p>}
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-4">
        <AlertCircle className="w-8 h-8 text-red-500" />
        <p className="text-sm text-red-600">Failed to load: {error}</p>
        <p className="text-xs text-gray-400">API: {API_BASE}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 max-w-7xl mx-auto">
      <header className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">VolunteerShift</h1>
          <p className="text-sm text-gray-500">Autonomous Volunteer Coordination Agent</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowCreateShift(!showCreateShift)}
            className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 transition"
          >
            <Plus className="w-4 h-4" />
            New Shift
          </button>
          <button
            onClick={fetchData}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
        </div>
      </header>

      {showCreateShift && <CreateShiftForm onClose={() => setShowCreateShift(false)} onCreated={fetchData} />}

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
        <StatCard icon={<Calendar className="w-5 h-5" />} label="Total Shifts" value={data?.total_shifts ?? 0} color="bg-blue-50 text-blue-600" />
        <StatCard icon={<Users className="w-5 h-5" />} label="Active Shifts" value={data?.active_shifts?.length ?? 0} color="bg-green-50 text-green-600" />
        <StatCard icon={<Mail className="w-5 h-5" />} label="Communications" value={data?.total_communications ?? 0} color="bg-purple-50 text-purple-600" />
        <StatCard icon={<Activity className="w-5 h-5" />} label="Agent Status" value="Active" color="bg-yellow-50 text-yellow-600" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            Active Shifts
          </h2>
          <div className="space-y-3">
            {data?.active_shifts?.map((shift) => (
              <ShiftCard key={shift.id} shift={shift} onTrigger={handleTrigger} triggering={triggering} />
            ))}
            {data?.active_shifts?.length === 0 && (
              <p className="text-sm text-gray-400">No active shifts</p>
            )}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Mail className="w-5 h-5 text-gray-400" />
            Recent Communications
          </h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {data?.recent_communications?.map((comm) => (
              <CommCard key={comm.id} comm={comm} />
            ))}
            {data?.recent_communications?.length === 0 && (
              <p className="text-sm text-gray-400">No communications yet</p>
            )}
          </div>
        </div>
      </div>

      {triggerResult && (
        <div className="mt-6 bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Activity className="w-5 h-5 text-brand-600" />
            Agent Output
          </h2>
          <pre className="text-sm text-gray-700 whitespace-pre-wrap max-h-96 overflow-y-auto">
            {triggerResult}
          </pre>
        </div>
      )}
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number | string; color: string }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center mb-2 ${color}`}>
        {icon}
      </div>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function ShiftCard({ shift, onTrigger, triggering }: { shift: Shift; onTrigger: (action: string, shiftId?: string) => void; triggering: string | null }) {
  const startTime = new Date(shift.start_time).toLocaleString();
  const confirmed = shift.assigned_volunteers?.filter((a: any) => a.status === "confirmed").length ?? 0;

  return (
    <div className="border border-gray-200 rounded-lg p-4 hover:border-brand-500 transition">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="font-medium text-gray-900">{shift.program_name}</h3>
          <p className="text-xs text-gray-500">{shift.location}</p>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[shift.status] || "bg-gray-100"}`}>
          {shift.status.replace("_", " ")}
        </span>
      </div>
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {startTime}</span>
        <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {confirmed}/{shift.required_volunteers}</span>
        {shift.required_skills.length > 0 && (
          <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3" /> {shift.required_skills.join(", ")}</span>
        )}
      </div>
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => onTrigger("schedule", shift.id)}
          disabled={triggering !== null}
          className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition disabled:opacity-50"
        >
          <Play className="w-3 h-3 inline mr-1" /> Schedule
        </button>
        <button
          onClick={() => onTrigger("remind", shift.id)}
          disabled={triggering !== null}
          className="text-xs px-3 py-1.5 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition disabled:opacity-50"
        >
          <Play className="w-3 h-3 inline mr-1" /> Remind
        </button>
        <button
          onClick={() => onTrigger("noshow_check", shift.id)}
          disabled={triggering !== null}
          className="text-xs px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 transition disabled:opacity-50"
        >
          <Play className="w-3 h-3 inline mr-1" /> No-Show Check
        </button>
        <button
          onClick={() => onTrigger("track", shift.id)}
          disabled={triggering !== null}
          className="text-xs px-3 py-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 transition disabled:opacity-50"
        >
          <Play className="w-3 h-3 inline mr-1" /> Track Hours
        </button>
      </div>
    </div>
  );
}

function CommCard({ comm }: { comm: Communication }) {
  const sentTime = new Date(comm.sent_at).toLocaleString();
  return (
    <div className="border border-gray-100 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium text-gray-700">{comm.message_type.replace(/_/g, " ")}</span>
        <span className="text-xs text-gray-400">{sentTime}</span>
      </div>
      <p className="text-xs text-gray-600 line-clamp-2">{comm.content}</p>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-gray-400">Volunteer: {comm.volunteer_id}</span>
        <span className="text-xs text-gray-400">Channel: {comm.channel}</span>
        {comm.response && (
          <span className="text-xs text-green-600">Response: {comm.response}</span>
        )}
      </div>
    </div>
  );
}

function CreateShiftForm({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [programName, setProgramName] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [skills, setSkills] = useState("");
  const [requiredVolunteers, setRequiredVolunteers] = useState("3");
  const [creating, setCreating] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await fetch(`${API_BASE}/api/shifts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          program_name: programName,
          start_time: new Date(startTime).toISOString(),
          end_time: new Date(endTime).toISOString(),
          location,
          required_skills: skills ? skills.split(",").map((s) => s.trim()) : [],
          required_volunteers: parseInt(requiredVolunteers),
        }),
      });
      onCreated();
      onClose();
    } catch (err) {
      console.error("Failed to create shift:", err);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
      <h2 className="text-lg font-semibold mb-4">Create New Shift</h2>
      <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
        <input
          type="text"
          placeholder="Program Name"
          value={programName}
          onChange={(e) => setProgramName(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          required
        />
        <input
          type="text"
          placeholder="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          required
        />
        <input
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          required
        />
        <input
          type="datetime-local"
          value={endTime}
          onChange={(e) => setEndTime(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          required
        />
        <input
          type="text"
          placeholder="Skills (comma-separated)"
          value={skills}
          onChange={(e) => setSkills(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
        <input
          type="number"
          placeholder="Required Volunteers"
          value={requiredVolunteers}
          onChange={(e) => setRequiredVolunteers(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          min="1"
        />
        <div className="col-span-2 flex gap-2 justify-end">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            Cancel
          </button>
          <button
            type="submit"
            disabled={creating}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create Shift"}
          </button>
        </div>
      </form>
    </div>
  );
}
