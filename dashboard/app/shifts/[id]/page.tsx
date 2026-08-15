"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, MapPin, Users, Play, Loader2 } from "lucide-react";
import { API_BASE, Shift, Communication, fetchJson } from "@/lib/api";

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  partially_filled: "bg-yellow-100 text-yellow-700",
  filled: "bg-green-100 text-green-700",
  in_progress: "bg-purple-100 text-purple-700",
  completed: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-700",
};

const assignmentBadges: Record<string, string> = {
  invited: "bg-gray-100 text-gray-600",
  confirmed: "bg-green-100 text-green-700",
  declined: "bg-red-100 text-red-700",
  checked_in: "bg-blue-100 text-blue-700",
  checked_out: "bg-teal-100 text-teal-700",
  no_show: "bg-red-100 text-red-700",
};

export default function ShiftDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [shift, setShift] = useState<Shift | null>(null);
  const [comms, setComms] = useState<Communication[]>([]);
  const [error, setError] = useState("");
  const [triggering, setTriggering] = useState<string | null>(null);
  const [triggerResult, setTriggerResult] = useState("");

  const load = async () => {
    try {
      const s = await fetchJson<Shift>(`/api/shifts/${id}`);
      setShift(s);
      const c = await fetchJson<Communication[]>(`/api/communications`);
      setComms(c.filter((x) => x.shift_id === id));
    } catch (e: any) {
      setError(e.message || "Failed to load");
    }
  };

  useEffect(() => {
    load();
  }, [id]);

  const trigger = async (action: string) => {
    setTriggering(action);
    setTriggerResult("");
    try {
      const res = await fetch(`${API_BASE}/api/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, shift_id: id }),
      });
      const json = await res.json();
      setTriggerResult(json.result || JSON.stringify(json));
      load();
    } catch (e: any) {
      setTriggerResult(`Error: ${e.message}`);
    } finally {
      setTriggering(null);
    }
  };

  if (!shift && !error) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!shift) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div>
      <Link href="/shifts" className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Shifts
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{shift.program_name}</h1>
            <p className="text-sm text-gray-500 mt-0.5">{shift.id}</p>
          </div>
          <span className={`text-xs px-3 py-1.5 rounded-full font-medium ${statusColors[shift.status] || "bg-gray-100"}`}>
            {shift.status.replace("_", " ")}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
          <p className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-gray-400" />
            {new Date(shift.start_time).toLocaleString()} – {new Date(shift.end_time).toLocaleTimeString()}
          </p>
          <p className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-gray-400" />
            {shift.location}
          </p>
          <p className="flex items-center gap-2">
            <Users className="w-4 h-4 text-gray-400" />
            {shift.required_volunteers} required
            {shift.required_skills.length > 0 && ` · ${shift.required_skills.join(", ")}`}
          </p>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button onClick={() => trigger("schedule")} disabled={triggering !== null}
            className="text-xs px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 disabled:opacity-50">
            <Play className="w-3 h-3 inline mr-1" /> Schedule
          </button>
          <button onClick={() => trigger("remind")} disabled={triggering !== null}
            className="text-xs px-3 py-1.5 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 disabled:opacity-50">
            <Play className="w-3 h-3 inline mr-1" /> Remind
          </button>
          <button onClick={() => trigger("noshow_check")} disabled={triggering !== null}
            className="text-xs px-3 py-1.5 bg-orange-50 text-orange-600 rounded-lg hover:bg-orange-100 disabled:opacity-50">
            <Play className="w-3 h-3 inline mr-1" /> No-Show Check
          </button>
          <button onClick={() => trigger("track")} disabled={triggering !== null}
            className="text-xs px-3 py-1.5 bg-green-50 text-green-600 rounded-lg hover:bg-green-100 disabled:opacity-50">
            <Play className="w-3 h-3 inline mr-1" /> Track Hours
          </button>
        </div>

        {triggering && <p className="text-xs text-gray-400 mt-3">Running {triggering}...</p>}
        {triggerResult && (
          <pre className="mt-4 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 max-h-48 overflow-y-auto whitespace-pre-wrap">
            {triggerResult}
          </pre>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4">Assignments ({shift.assigned_volunteers.length})</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b">
                <th className="py-2 pr-4">Volunteer</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4">Confirmed At</th>
                <th className="py-2 pr-4">Check-in</th>
                <th className="py-2 pr-4">Check-out</th>
              </tr>
            </thead>
            <tbody>
              {shift.assigned_volunteers.map((a) => (
                <tr key={a.volunteer_id} className="border-b border-gray-50">
                  <td className="py-2 pr-4 font-medium text-gray-800">{a.volunteer_id}</td>
                  <td className="py-2 pr-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full ${assignmentBadges[a.status] || "bg-gray-100"}`}>
                      {a.status.replace("_", " ")}
                    </span>
                  </td>
                  <td className="py-2 pr-4 text-gray-500">{a.confirmed_at ? new Date(a.confirmed_at).toLocaleString() : "—"}</td>
                  <td className="py-2 pr-4 text-gray-500">{a.checked_in_at ? new Date(a.checked_in_at).toLocaleString() : "—"}</td>
                  <td className="py-2 pr-4 text-gray-500">{a.checked_out_at ? new Date(a.checked_out_at).toLocaleString() : "—"}</td>
                </tr>
              ))}
              {shift.assigned_volunteers.length === 0 && (
                <tr><td colSpan={5} className="py-4 text-center text-gray-400">No volunteers assigned yet</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-4">Communications ({comms.length})</h2>
        <div className="space-y-2">
          {comms.map((c) => (
            <div key={c.id} className="border border-gray-100 rounded-lg p-3 text-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-medium text-gray-700">{c.message_type.replace(/_/g, " ")} · {c.channel}</span>
                <span className="text-xs text-gray-400">{new Date(c.sent_at).toLocaleString()}</span>
              </div>
              <p className="text-xs text-gray-600">{c.content}</p>
            </div>
          ))}
          {comms.length === 0 && <p className="text-sm text-gray-400">No communications for this shift</p>}
        </div>
      </div>
    </div>
  );
}