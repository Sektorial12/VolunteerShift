"use client";

import { useEffect, useState } from "react";
import { Settings2, Loader2, Play, RefreshCw } from "lucide-react";
import { API_BASE } from "@/lib/api";

interface AutomationStatus {
  enabled: boolean;
  worker_running: boolean;
  interval_seconds: number;
  time_acceleration: number;
  clock: string;
}

export default function AutomationPage() {
  const [status, setStatus] = useState<AutomationStatus | null>(null);
  const [runResult, setRunResult] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/automation/status`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStatus(await res.json());
    } catch (e: any) {
      setError(e.message || "Failed to load");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const runNow = async () => {
    setRunning(true);
    setRunResult("");
    try {
      const res = await fetch(`${API_BASE}/api/automation/run`, { method: "POST" });
      const json = await res.json();
      setRunResult(
        `Ran ${json.ran} action(s).\n` +
        (json.results || []).map((r: any) => `  - ${r.action || "?"} ${r.shift_id || ""} ${r.result ? "ok" : r.error || ""}`).join("\n")
      );
    } catch (e: any) {
      setRunResult(`Error: ${e.message}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Automation</h1>
          <p className="text-sm text-gray-500">Scheduled agent actions that run without manual triggers</p>
        </div>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
          <RefreshCw className="w-4 h-4" /> Refresh
        </button>
      </header>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
          <Settings2 className="w-5 h-5 text-gray-400" /> Worker Status
        </h2>
        {!status ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin text-gray-400" /></div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-lg font-bold text-gray-900">{status.worker_running ? "Running" : "Stopped"}</p>
              <p className="text-xs text-gray-500">Worker</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-lg font-bold text-gray-900">{status.enabled ? "Enabled" : "Disabled"}</p>
              <p className="text-xs text-gray-500">AUTOMATION_ENABLED</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-lg font-bold text-gray-900">{status.interval_seconds}s</p>
              <p className="text-xs text-gray-500">Interval</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-3">
              <p className="text-lg font-bold text-gray-900">{status.time_acceleration}x</p>
              <p className="text-xs text-gray-500">Time Acceleration</p>
            </div>
          </div>
        )}
        {status?.clock && (
          <p className="text-xs text-gray-400 mt-4">Agent clock: {new Date(status.clock).toLocaleString()}</p>
        )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-semibold mb-2">Run Now</h2>
        <p className="text-sm text-gray-500 mb-4">
          Manually run the automation cycle. Executes any due actions (schedule, reminders, no-show checks, hour tracking).
        </p>
        <button
          onClick={runNow}
          disabled={running}
          className="flex items-center gap-2 px-4 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50"
        >
          <Play className="w-4 h-4" /> {running ? "Running..." : "Run Automation Cycle"}
        </button>
        {runResult && (
          <pre className="mt-4 text-xs text-gray-600 bg-gray-50 rounded-lg p-3 whitespace-pre-wrap max-h-48 overflow-y-auto">{runResult}</pre>
        )}
      </div>
    </div>
  );
}