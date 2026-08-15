"use client";

import { useState, useCallback, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, XCircle, Loader2, Calendar, MapPin } from "lucide-react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export default function RespondPage() {
  const searchParams = useSearchParams();
  const volunteerId = searchParams.get("volunteer_id") || "";
  const shiftId = searchParams.get("shift_id") || "";

  const [shift, setShift] = useState<any>(null);
  const [volunteer, setVolunteer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [response, setResponse] = useState("");

  const load = useCallback(async () => {
    if (!shiftId || !volunteerId) {
      setError("Missing shift_id or volunteer_id in the link.");
      setLoading(false);
      return;
    }
    try {
      const [shiftRes, volRes] = await Promise.all([
        fetch(`${API_BASE}/api/shifts/${shiftId}`),
        fetch(`${API_BASE}/api/volunteers/${volunteerId}`),
      ]);
      if (!shiftRes.ok || !volRes.ok) throw new Error("Not found");
      setShift(await shiftRes.json());
      setVolunteer(await volRes.json());
    } catch {
      setError("We couldn't load this invitation. The link may be invalid or expired.");
    } finally {
      setLoading(false);
    }
  }, [shiftId, volunteerId]);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async (choice: string) => {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/volunteers/respond`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          volunteer_id: volunteerId,
          shift_id: shiftId,
          response: choice,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Something went wrong");
      setResponse(choice);
      setDone(true);
    } catch (e: any) {
      setError(e.message || "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-gray-400" />
      </div>
    );
  }

  if (error && !shift) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow p-8 max-w-md w-full text-center">
          <p className="text-gray-700">{error}</p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
        <div className="bg-white rounded-2xl shadow p-10 max-w-md w-full text-center">
          {response === "confirm" ? (
            <>
              <CheckCircle className="mx-auto text-green-500 h-12 w-12" />
              <h1 className="mt-4 text-2xl font-bold text-gray-900">You're confirmed!</h1>
              <p className="mt-2 text-gray-600">
                Thanks {volunteer?.name}. We'll see you at the shift. A confirmation was sent
                to your coordinator.
              </p>
            </>
          ) : (
            <>
              <XCircle className="mx-auto text-red-500 h-12 w-12" />
              <h1 className="mt-4 text-2xl font-bold text-gray-900">Thanks for letting us know</h1>
              <p className="mt-2 text-gray-600">
                We've noted that you can't make this shift, {volunteer?.name}. No worries —
                we'll find coverage.
              </p>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full">
        <p className="text-sm text-gray-500">Shift invitation</p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">
          Hi {volunteer?.name || "there"},
        </h1>
        <p className="mt-1 text-gray-600">You've been invited to volunteer for:</p>

        <div className="mt-4 border border-gray-200 rounded-xl p-4">
          <h2 className="text-lg font-semibold text-gray-900">{shift?.program_name}</h2>
          <div className="mt-2 space-y-1 text-sm text-gray-600">
            <p className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              {new Date(shift?.start_time).toLocaleString()} – {new Date(shift?.end_time).toLocaleTimeString()}
            </p>
            <p className="flex items-center gap-2">
              <MapPin className="h-4 w-4" />
              {shift?.location}
            </p>
          </div>
          {shift?.required_skills?.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-1">
              {shift.required_skills.map((s: string) => (
                <span key={s} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                  {s}
                </span>
              ))}
            </div>
          )}
        </div>

        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <button
            onClick={() => submit("confirm")}
            disabled={submitting}
            className="py-3 rounded-xl bg-green-600 text-white font-semibold hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? "Saving..." : "Yes, I can help"}
          </button>
          <button
            onClick={() => submit("decline")}
            disabled={submitting}
            className="py-3 rounded-xl bg-gray-200 text-gray-700 font-semibold hover:bg-gray-300 disabled:opacity-50"
          >
            No, can't make it
          </button>
        </div>
      </div>
    </div>
  );
}
