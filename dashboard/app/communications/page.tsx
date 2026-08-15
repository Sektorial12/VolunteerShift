"use client";

import { useEffect, useState } from "react";
import { Mail, Loader2, RefreshCw } from "lucide-react";
import { Communication, fetchJson } from "@/lib/api";

export default function CommunicationsPage() {
  const [comms, setComms] = useState<Communication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setComms(await fetchJson<Communication[]>("/api/communications"));
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
          <h1 className="text-2xl font-bold text-gray-900">Communications</h1>
          <p className="text-sm text-gray-500">Every message sent to volunteers</p>
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

      <div className="space-y-3">
        {comms.map((c) => (
          <div key={c.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-gray-400" />
                <span className="text-xs font-medium text-gray-700">{c.message_type.replace(/_/g, " ")}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full ${
                  c.channel === "email" ? "bg-blue-100 text-blue-700" : c.channel === "sms" ? "bg-purple-100 text-purple-700" : "bg-gray-100 text-gray-600"
                }`}>
                  {c.channel}
                </span>
              </div>
              <span className="text-xs text-gray-400">{new Date(c.sent_at).toLocaleString()}</span>
            </div>
            <p className="text-sm text-gray-600">{c.content}</p>
            <div className="mt-2 flex items-center gap-3 text-xs text-gray-400">
              <span>Shift: {c.shift_id || "—"}</span>
              <span>Volunteer: {c.volunteer_id || "—"}</span>
              {c.response && <span className="text-green-600">Response: {c.response}</span>}
            </div>
          </div>
        ))}
      </div>

      {!loading && comms.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <Mail className="w-10 h-10 mx-auto mb-2" />
          <p>No communications sent yet</p>
        </div>
      )}
    </div>
  );
}