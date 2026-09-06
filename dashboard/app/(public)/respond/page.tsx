"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CalendarDays, CheckCircle2, Loader2, MapPin, Sparkles, XCircle, Clock } from "lucide-react";
import { api, type Shift, type Volunteer } from "@/lib/api";
import { errMessage } from "@/lib/hooks";
import { durationHours, fmtShiftWindow, humanize } from "@/lib/format";
import { Button, Chip } from "@/components/ui";

export default function RespondPage() {
  return (
    <Suspense fallback={<Centered><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></Centered>}>
      <RespondInner />
    </Suspense>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 via-white to-white p-4">
      {children}
    </div>
  );
}

function gcalLink(shift: Shift): string {
  const fmt = (iso: string) => new Date(iso).toISOString().replace(/[-:]|\.\d{3}/g, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Volunteer: ${shift.program_name}`,
    dates: `${fmt(shift.start_time)}/${fmt(shift.end_time)}`,
    location: shift.location,
    details: "Thanks for volunteering! Scheduled via VolunteerShift.",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function RespondInner() {
  const params = useSearchParams();
  const volunteerId = params.get("volunteer_id") ?? "";
  const shiftId = params.get("shift_id") ?? "";

  const [shift, setShift] = useState<Shift | null>(null);
  const [volunteer, setVolunteer] = useState<Volunteer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [submitting, setSubmitting] = useState<"confirm" | "decline" | null>(null);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState<"confirm" | "decline" | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!volunteerId || !shiftId) {
        setLoadError("This link is missing its shift or volunteer reference.");
        setLoading(false);
        return;
      }
      try {
        const [s, v] = await Promise.all([api.shift(shiftId), api.volunteer(volunteerId)]);
        if (!alive) return;
        setShift(s);
        setVolunteer(v);
      } catch {
        if (alive) setLoadError("We could not find this invitation. The link may be invalid or the shift may have been removed.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [volunteerId, shiftId]);

  const assignment = useMemo(() => shift?.assigned_volunteers.find((a) => a.volunteer_id === volunteerId), [shift, volunteerId]);
  const alreadyAnswered = assignment && ["confirmed", "declined", "checked_in", "checked_out"].includes(assignment.status);

  const submit = async (choice: "confirm" | "decline") => {
    setSubmitting(choice);
    setSubmitError("");
    try {
      await api.respond(volunteerId, shiftId, choice);
      setDone(choice);
    } catch (e) {
      setSubmitError(errMessage(e));
    } finally {
      setSubmitting(null);
    }
  };

  if (loading) {
    return (
      <Centered>
        <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
      </Centered>
    );
  }

  if (loadError || !shift) {
    return (
      <Centered>
        <div className="card w-full max-w-md p-8 text-center animate-fade-up">
          <XCircle className="mx-auto h-10 w-10 text-slate-300" />
          <h1 className="mt-3 text-lg font-semibold text-slate-900">Invitation not found</h1>
          <p className="mt-1 text-sm text-slate-500">{loadError}</p>
        </div>
      </Centered>
    );
  }

  const firstName = volunteer?.name?.split(" ")[0] ?? "there";
  const finalChoice = done ?? (alreadyAnswered ? (assignment!.status === "declined" ? "decline" : "confirm") : null);

  return (
    <Centered>
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-5 flex items-center justify-center gap-2 text-slate-500">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-medium">VolunteerShift</span>
        </div>

        <div className="card overflow-hidden">
          {finalChoice ? (
            <div className="p-8 text-center">
              {finalChoice === "confirm" ? (
                <>
                  <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                    <CheckCircle2 className="h-7 w-7" />
                  </span>
                  <h1 className="mt-4 text-2xl font-semibold text-slate-900">You&apos;re confirmed, {firstName}!</h1>
                  <p className="mt-2 text-sm text-slate-500">
                    We&apos;ll send a reminder before the shift. Your coordinator has been notified automatically.
                  </p>
                  <a
                    href={gcalLink(shift)}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
                  >
                    <CalendarDays className="h-4 w-4" /> Add to Google Calendar
                  </a>
                </>
              ) : (
                <>
                  <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-500">
                    <XCircle className="h-7 w-7" />
                  </span>
                  <h1 className="mt-4 text-2xl font-semibold text-slate-900">Thanks for letting us know</h1>
                  <p className="mt-2 text-sm text-slate-500">
                    No worries, {firstName}. The agent is already looking for someone to cover this one. We&apos;ll reach out again for
                    the next shift that fits your schedule.
                  </p>
                </>
              )}
              {alreadyAnswered && !done && (
                <p className="mt-4 text-xs text-slate-400">You responded to this invitation earlier.</p>
              )}
            </div>
          ) : (
            <>
              <div className="border-b border-slate-100 bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white">
                <p className="text-xs font-medium uppercase tracking-wide text-brand-100">Shift invitation</p>
                <h1 className="mt-1 text-2xl font-semibold">Hi {firstName}, can you help?</h1>
                <p className="mt-1 text-sm text-brand-100">
                  You were matched to this shift because your skills and availability fit. One tap is all we need.
                </p>
              </div>
              <div className="p-6">
                <h2 className="text-lg font-semibold text-slate-900">{shift.program_name}</h2>
                <dl className="mt-3 space-y-2 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-slate-400" />
                    <dd>{fmtShiftWindow(shift)}</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-slate-400" />
                    <dd>{durationHours(shift).toFixed(1).replace(/\.0$/, "")} hours</dd>
                  </div>
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-slate-400" />
                    <dd>{shift.location}</dd>
                  </div>
                </dl>
                {shift.required_skills?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {shift.required_skills.map((s) => (
                      <Chip key={s}>{humanize(s)}</Chip>
                    ))}
                  </div>
                )}

                {submitError && <p className="mt-4 rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{submitError}</p>}

                <div className="mt-6 grid grid-cols-2 gap-3">
                  <Button
                    size="lg"
                    className="!bg-brand-600 !text-white hover:!bg-brand-700 !ring-0"
                    loading={submitting === "confirm"}
                    disabled={submitting !== null}
                    onClick={() => submit("confirm")}
                  >
                    Yes, count me in
                  </Button>
                  <Button size="lg" variant="secondary" loading={submitting === "decline"} disabled={submitting !== null} onClick={() => submit("decline")}>
                    Can&apos;t make it
                  </Button>
                </div>
                <p className="mt-3 text-center text-[11px] text-slate-400">
                  Responding for <span className="font-medium text-slate-500">{volunteer?.name}</span>. Not you?{" "}
                  <Link href="/" className="underline">
                    Ignore this link.
                  </Link>
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </Centered>
  );
}
