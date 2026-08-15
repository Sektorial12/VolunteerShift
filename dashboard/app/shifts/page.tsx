"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CalendarDays, Users, Clock, Loader2 } from "lucide-react";
import { API_BASE, Shift, fetchJson } from "@/lib/api";

const statusColors: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  partially_filled: "bg-yellow-100 text-yellow-700",
  filled: "bg-green-100 text-green-700",
  in_progress: "bg-purple-100 text-purple-700",
  completed: "bg-gray-100 text-gray-700",
  cancelled: "bg-red-100 text-red-700",
};

export default function ShiftsPage() {
  const [shifts, setShifts] = useState<Shift[] | null>(null);
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setShifts(await fetchJson<Shift[]>("/api/shifts"));
    } catch (e: any) {
      setError(e.message || "Failed to load");
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Shifts</h1>
        <p className="text-sm text-gray-500">All shifts across programs</p>
      </header>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      {!shifts && !error && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-gray-400" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {shifts?.map((s) => {
          const confirmed = s.assigned_volunteers.filter((a) => a.status === "confirmed").length;
          return (
            <Link
              key={s.id}
              href={`/shifts/${s.id}`}
              className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:border-brand-500 transition"
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="font-medium text-gray-900">{s.program_name}</h3>
                <span className={`text-xs px-2 py-1 rounded-full font-medium ${statusColors[s.status] || "bg-gray-100"}`}>
                  {s.status.replace("_", " ")}
                </span>
              </div>
              <p className="text-xs text-gray-500 mb-3">{s.location}</p>
              <div className="space-y-1 text-xs text-gray-500">
                <p className="flex items-center gap-1.5">
                  <Clock className="w-3 h-3" />
                  {new Date(s.start_time).toLocaleString()} – {new Date(s.end_time).toLocaleTimeString()}
                </p>
                <p className="flex items-center gap-1.5">
                  <Users className="w-3 h-3" />
                  {s.assigned_volunteers.length} assigned, {confirmed} confirmed / {s.required_volunteers} required
                </p>
                {s.required_skills.length > 0 && (
                  <p className="flex items-center gap-1.5">
                    <CalendarDays className="w-3 h-3" />
                    {s.required_skills.join(", ")}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}