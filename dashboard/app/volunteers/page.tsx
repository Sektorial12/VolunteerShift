"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, Loader2, Search } from "lucide-react";
import { Volunteer, fetchJson } from "@/lib/api";

export default function VolunteersPage() {
  const [volunteers, setVolunteers] = useState<Volunteer[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

  const load = async () => {
    try {
      setVolunteers(await fetchJson<Volunteer[]>("/api/volunteers"));
    } catch (e: any) {
      setError(e.message || "Failed to load");
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = (volunteers ?? []).filter((v) => {
    const q = query.toLowerCase();
    return (
      v.name.toLowerCase().includes(q) ||
      v.email.toLowerCase().includes(q) ||
      v.skills.some((s) => s.toLowerCase().includes(q))
    );
  });

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Volunteers</h1>
        <p className="text-sm text-gray-500">{volunteers?.length ?? 0} in the pool</p>
      </header>

      <div className="mb-4 relative max-w-md">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email, or skill..."
          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
      {!volunteers && !error && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="animate-spin text-gray-400" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((v) => (
          <Link
            key={v.id}
            href={`/volunteers/${v.id}`}
            className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 hover:border-brand-500 transition"
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center font-semibold">
                {v.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
              </div>
              <div>
                <h3 className="font-medium text-gray-900">{v.name}</h3>
                <p className="text-xs text-gray-500">{v.email}</p>
              </div>
            </div>
            <div className="flex items-center justify-between text-xs text-gray-500">
              <span className="flex items-center gap-1"><Users className="w-3 h-3" /> {v.total_hours} hrs</span>
              <span className={`px-2 py-0.5 rounded-full ${v.reliability_score >= 0.8 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"}`}>
                {(v.reliability_score * 100).toFixed(0)}% reliable
              </span>
            </div>
            {v.skills.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1">
                {v.skills.slice(0, 4).map((s) => (
                  <span key={s} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{s}</span>
                ))}
              </div>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}