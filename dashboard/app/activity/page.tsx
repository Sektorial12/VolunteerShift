"use client";

import { useEffect, useState } from "react";
import { Activity, Loader2, RefreshCw } from "lucide-react";
import { API_BASE, fetchJson } from "@/lib/api";

interface AuditEntry {
  id: string;
  timestamp: string;
  tool_name: string;
  tool_input: string;
  result: string;
}

const toolColors: Record<string, string> = {
  send_email: "bg-blue-100 text-blue-700",
  send_sms: "bg-purple-100 text-purple-700",
  log_communication: "bg-teal-100 text-teal-700",
  assign_volunteers_to_shift: "bg-green-100 text-green-700",
  match_volunteers_to_shifts: "bg-green-100 text-green-700",
  generate_report: "bg-orange-100 text-orange-700",
  log_hours: "bg-cyan-100 text-cyan-700",
  check_shift_coverage: "bg-yellow-100 text-yellow-700",
};

export default function ActivityPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const items = await fetchJson<AuditEntry[]>(`${API_BASE}/api/audit`);
      setEntries(items);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Agent Activity</h1>
          <p className="text-sm text-gray-500">Audit trail of every tool call</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </header>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-gray-400" />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
          {entries.map((e) => {
            let input: string = e.tool_input;
            try {
              input = JSON.stringify(JSON.parse(e.tool_input), null, 1);
            } catch {
              /* keep raw */
            }
            return (
              <div key={e.id} className="p-4 flex gap-3">
                <Activity className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${toolColors[e.tool_name] || "bg-gray-100 text-gray-600"}`}>
                      {e.tool_name}
                    </span>
                    <span className="text-xs text-gray-400">
                      {e.timestamp ? new Date(e.timestamp).toLocaleString() : ""}
                    </span>
                  </div>
                  <pre className="text-xs text-gray-600 bg-gray-50 rounded p-2 overflow-x-auto whitespace-pre-wrap">{input}</pre>
                </div>
              </div>
            );
          })}
        </div>
        {!loading && entries.length === 0 && (
          <div className="text-center py-20 text-gray-400">
            <Activity className="w-10 h-10 mx-auto mb-2" />
            <p>No agent activity recorded yet. Trigger an agent action to see tool calls.</p>
          </div>
        )}
      </div>
    </div>
  );
}