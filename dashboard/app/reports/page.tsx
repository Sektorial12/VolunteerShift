"use client";

import { useEffect, useState } from "react";
import { FileText, Loader2, RefreshCw, Play } from "lucide-react";
import { API_BASE, Report, fetchJson } from "@/lib/api";

export default function ReportsPage() {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setReports(await fetchJson<Report[]>("/api/reports"));
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const generate = async () => {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/trigger`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "report" }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      await load();
    } catch (e: any) {
      setError(e.message || "Failed to generate");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div>
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500">Generated weekly/monthly summaries</p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200">
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-2 px-3 py-2 bg-brand-600 text-white rounded-lg text-sm hover:bg-brand-700 disabled:opacity-50"
          >
            <Play className="w-4 h-4" /> {generating ? "Generating..." : "Generate Report"}
          </button>
        </div>
      </header>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-gray-400" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {reports.map((r) => (
          <div key={r.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-medium text-gray-900 capitalize">{r.period} Report</h3>
              <FileText className="w-4 h-4 text-gray-400" />
            </div>
            <p className="text-xs text-gray-500 mb-3">
              {r.start_date} – {r.end_date}
            </p>
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-lg font-bold text-gray-900">{r.total_shifts}</p>
                <p className="text-xs text-gray-500">Shifts</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-lg font-bold text-gray-900">{r.total_volunteers}</p>
                <p className="text-xs text-gray-500">Volunteers</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-lg font-bold text-gray-900">{(r.total_hours || 0).toFixed(1)}</p>
                <p className="text-xs text-gray-500">Hours</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-2">
                <p className="text-lg font-bold text-gray-900">{r.coverage_rate}%</p>
                <p className="text-xs text-gray-500">Coverage</p>
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-3">Generated {new Date(r.generated_at || Date.now()).toLocaleString()}</p>
          </div>
        ))}
      </div>

      {!loading && reports.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <FileText className="w-10 h-10 mx-auto mb-2" />
          <p>No reports yet. Click "Generate Report" to create one.</p>
        </div>
      )}
    </div>
  );
}