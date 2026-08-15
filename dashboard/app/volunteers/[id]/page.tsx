"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Clock, Phone, Mail, Loader2, Tag } from "lucide-react";
import { Volunteer, fetchJson } from "@/lib/api";

export default function VolunteerDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [volunteer, setVolunteer] = useState<Volunteer | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetchJson<Volunteer>(`/api/volunteers/${id}`)
      .then(setVolunteer)
      .catch((e: any) => setError(e.message || "Failed to load"));
  }, [id]);

  if (!volunteer && !error) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (!volunteer) return <p className="text-sm text-red-600">{error}</p>;

  return (
    <div>
      <Link href="/volunteers" className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 mb-4">
        <ArrowLeft className="w-4 h-4" /> Back to Volunteers
      </Link>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-brand-50 text-brand-700 flex items-center justify-center text-xl font-semibold">
            {volunteer.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
          </div>
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{volunteer.name}</h1>
            <p className="text-sm text-gray-500">{volunteer.id}</p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-600">
          <p className="flex items-center gap-2"><Mail className="w-4 h-4 text-gray-400" /> {volunteer.email}</p>
          <p className="flex items-center gap-2"><Phone className="w-4 h-4 text-gray-400" /> {volunteer.phone || "—"}</p>
          <p className="flex items-center gap-2"><Clock className="w-4 h-4 text-gray-400" /> {(volunteer.total_hours || 0).toFixed(1)} hours logged</p>
        </div>

        <div className="mt-5 flex items-center gap-3">
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
            volunteer.reliability_score >= 0.8 ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
          }`}>
            {(volunteer.reliability_score * 100).toFixed(0)}% reliable
          </span>
          <span className={`text-xs px-3 py-1 rounded-full font-medium ${
            volunteer.status === "active" ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
          }`}>
            {volunteer.status}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2"><Tag className="w-4 h-4 text-gray-400" /> Skills</h2>
          <div className="flex flex-wrap gap-2">
            {volunteer.skills.map((s) => (
              <span key={s} className="text-xs bg-gray-100 text-gray-700 px-2.5 py-1 rounded-full">{s}</span>
            ))}
            {volunteer.skills.length === 0 && <p className="text-sm text-gray-400">No skills listed</p>}
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-3">Availability</h2>
          <div className="space-y-2">
            {Object.entries(volunteer.availability).map(([day, slots]) => (
              <div key={day} className="text-sm">
                <span className="font-medium text-gray-700 capitalize">{day}:</span>{" "}
                <span className="text-gray-500">{slots.join(", ") || "—"}</span>
              </div>
            ))}
            {Object.keys(volunteer.availability).length === 0 && <p className="text-sm text-gray-400">No availability set</p>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mt-6">
        <h2 className="text-lg font-semibold mb-3">Past Shifts ({volunteer.past_shifts.length})</h2>
        {volunteer.past_shifts.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {volunteer.past_shifts.map((sid) => (
              <span key={sid} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{sid}</span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No past shifts</p>
        )}
        {volunteer.notes && (
          <p className="text-sm text-gray-600 mt-4"><span className="font-medium">Notes:</span> {volunteer.notes}</p>
        )}
      </div>
    </div>
  );
}