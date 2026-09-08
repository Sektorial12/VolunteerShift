"use client";

import { useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Loader2, Sparkles } from "lucide-react";
import { api } from "@/lib/api";
import { errMessage } from "@/lib/hooks";
import { humanize } from "@/lib/format";
import { Button, Field, inputClass } from "@/components/ui";

// Same vocabulary the Scheduler agent matches against (see utils/seed_data.py).
const SKILL_OPTIONS = ["food_handling", "first_aid", "driving"];
const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
const SLOTS = ["morning", "afternoon", "evening"];
const CHANNELS = ["email"];

function toggle(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

function ToggleChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ring-1 transition " +
        (active
          ? "bg-brand-600 text-white ring-brand-600"
          : "bg-white text-slate-600 ring-slate-200 hover:ring-slate-400")
      }
    >
      {children}
    </button>
  );
}

export default function SignupPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [skills, setSkills] = useState<string[]>([]);
  const [otherSkills, setOtherSkills] = useState("");
  const [availability, setAvailability] = useState<Record<string, string[]>>({});
  const [channels, setChannels] = useState<string[]>(["email"]);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [done, setDone] = useState<"created" | "updated" | null>(null);

  const toggleSlot = (day: string, slot: string) => {
    setAvailability((prev) => {
      const current = prev[day] ?? [];
      const next = current.includes(slot) ? current.filter((s) => s !== slot) : [...current, slot];
      const copy = { ...prev };
      if (next.length) copy[day] = next;
      else delete copy[day];
      return copy;
    });
  };

  const toggleChannel = (c: string) => {
    // keep at least one channel selected
    if (channels.includes(c) && channels.length === 1) return;
    setChannels(toggle(channels, c));
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError("");

    if (!name.trim()) return setSubmitError("Please tell us your name.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return setSubmitError("Please enter a valid email address — it is how the agent will reach you.");

    const allSkills = [
      ...skills,
      ...otherSkills
        .split(",")
        .map((s) => s.trim().toLowerCase().replace(/\s+/g, "_"))
        .filter(Boolean),
    ];

    setSubmitting(true);
    try {
      const res = await api.signupVolunteer({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        skills: allSkills,
        availability,
        preferred_channels: channels,
      });
      setDone(res.status === "updated" ? "updated" : "created");
    } catch (err) {
      setSubmitError(errMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 via-white to-white p-4">
      <div className="w-full max-w-md animate-fade-up">
        <div className="mb-5 flex items-center justify-center gap-2 text-slate-500">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br from-brand-500 to-brand-700 text-white">
            <Sparkles className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-medium">VolunteerShift</span>
        </div>

        <div className="card overflow-hidden">
          {done ? (
            <div className="p-8 text-center">
              <span className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600">
                <CheckCircle2 className="h-7 w-7" />
              </span>
              <h1 className="mt-4 text-2xl font-semibold text-slate-900">
                {done === "created" ? "You're on the list" : "Your details are updated"}
              </h1>
              <p className="mt-2 text-sm text-slate-500">
                When a shift matches your skills and availability, the coordinator agent will email
                you an invitation with a one-tap confirm link. No forms, no chasing — just say yes
                or no.
              </p>
              <Link
                href="/"
                className="mt-5 inline-flex h-10 items-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-medium text-white hover:bg-slate-800"
              >
                Back to home
              </Link>
            </div>
          ) : (
            <>
              <div className="border-b border-slate-100 bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white">
                <p className="text-xs font-medium uppercase tracking-wide text-brand-100">Volunteer sign-up</p>
                <h1 className="mt-1 text-2xl font-semibold">Join the volunteer pool</h1>
                <p className="mt-1 text-sm text-brand-100">
                  Sign up once. The agent matches you to shifts that fit your skills and hours, and
                  only emails you when there is one.
                </p>
              </div>

              <form onSubmit={submit} className="space-y-5 p-6">
                <Field label="Full name">
                  <input
                    className={inputClass}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Jane Doe"
                    autoComplete="name"
                  />
                </Field>
                <Field label="Email" hint="Invitations and reminders arrive here.">
                  <input
                    className={inputClass}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="jane@example.org"
                    type="email"
                    autoComplete="email"
                  />
                </Field>
                <Field label="Phone (optional)" hint="Reserved for future SMS notifications.">
                  <input
                    className={inputClass}
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+15551234567"
                    type="tel"
                    autoComplete="tel"
                  />
                </Field>

                <Field label="Skills">
                  <div className="flex flex-wrap gap-1.5">
                    {SKILL_OPTIONS.map((s) => (
                      <ToggleChip key={s} active={skills.includes(s)} onClick={() => setSkills(toggle(skills, s))}>
                        {humanize(s)}
                      </ToggleChip>
                    ))}
                  </div>
                  <input
                    className={inputClass + " mt-2"}
                    value={otherSkills}
                    onChange={(e) => setOtherSkills(e.target.value)}
                    placeholder="Other skills (comma separated, optional)"
                  />
                </Field>

                <Field label="When are you free?" hint="The agent only matches you to shifts inside these windows.">
                  <div className="space-y-1.5">
                    {DAYS.map((day) => (
                      <div key={day} className="flex items-center justify-between gap-2">
                        <span className="w-24 shrink-0 text-xs font-medium text-slate-500">{humanize(day)}</span>
                        <div className="flex flex-wrap gap-1.5">
                          {SLOTS.map((slot) => (
                            <ToggleChip
                              key={slot}
                              active={(availability[day] ?? []).includes(slot)}
                              onClick={() => toggleSlot(day, slot)}
                            >
                              {humanize(slot)}
                            </ToggleChip>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </Field>

                <Field label="How should we reach you?">
                  <div className="flex gap-1.5">
                    {CHANNELS.map((c) => (
                      <ToggleChip key={c} active={channels.includes(c)} onClick={() => toggleChannel(c)}>
                        {c === "email" ? "Email" : "SMS"}
                      </ToggleChip>
                    ))}
                  </div>
                </Field>

                {submitError && <p className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-700">{submitError}</p>}

                <Button
                  type="submit"
                  size="lg"
                  className="!bg-brand-600 !text-white hover:!bg-brand-700 !ring-0 w-full"
                  loading={submitting}
                  disabled={submitting}
                >
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Sign me up
                </Button>
                <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-slate-400">
                  <Clock className="h-3 w-3" /> Already signed up? Submit again with the same email to update your details.
                </p>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
