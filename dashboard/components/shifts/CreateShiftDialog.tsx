"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, X } from "lucide-react";
import { api, type ShiftCreateInput } from "@/lib/api";
import { errMessage } from "@/lib/hooks";
import { Button, Chip, Field, inputClass } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

const SKILL_SUGGESTIONS = [
  "food_handling",
  "customer_service",
  "heavy_lifting",
  "driving",
  "first_aid",
  "childcare",
  "teaching",
  "tech_support",
  "event_setup",
  "bilingual",
];

/**
 * ISO-8601 with an explicit +00:00 offset and no fractional seconds.
 * The backend parses these with Python's datetime.fromisoformat, which on
 * Python 3.10 (the VPS) rejects the trailing "Z" that Date.toISOString emits,
 * so a "Z" timestamp makes the Scheduler's matcher throw and match nobody.
 */
function toBackendIso(d: Date): string {
  return d.toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

function toLocalInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function defaultStart(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setHours(9, 0, 0, 0);
  return d;
}

export function CreateShiftDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: (shiftId: string) => void;
}) {
  const toast = useToast();
  const router = useRouter();
  const [program, setProgram] = useState("");
  const [location, setLocation] = useState("");
  const [start, setStart] = useState(() => toLocalInput(defaultStart()));
  const [end, setEnd] = useState(() => {
    const d = defaultStart();
    d.setHours(13);
    return toLocalInput(d);
  });
  const [required, setRequired] = useState(3);
  const [skills, setSkills] = useState<string[]>([]);
  const [skillInput, setSkillInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [touched, setTouched] = useState(false);
  const [autoOpenSchedule, setAutoOpenSchedule] = useState(true);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const errors = useMemo(() => {
    const e: Partial<Record<"program" | "location" | "start" | "end" | "required", string>> = {};
    if (!program.trim()) e.program = "Give the shift a program name.";
    if (!location.trim()) e.location = "Where should volunteers show up?";
    const s = new Date(start).getTime();
    const en = new Date(end).getTime();
    if (Number.isNaN(s)) e.start = "Pick a start time.";
    if (Number.isNaN(en)) e.end = "Pick an end time.";
    if (!e.start && !e.end && en <= s) e.end = "End must be after start.";
    if (!Number.isInteger(required) || required < 1) e.required = "At least one volunteer.";
    return e;
  }, [program, location, start, end, required]);

  const addSkill = (raw: string) => {
    const s = raw.trim().toLowerCase().replace(/\s+/g, "_");
    if (!s || skills.includes(s)) return;
    setSkills((xs) => [...xs, s]);
    setSkillInput("");
  };

  const submit = async () => {
    setTouched(true);
    if (Object.keys(errors).length) return;
    setSubmitting(true);
    try {
      const payload: ShiftCreateInput = {
        program_name: program.trim(),
        location: location.trim(),
        start_time: toBackendIso(new Date(start)),
        end_time: toBackendIso(new Date(end)),
        required_skills: skills,
        required_volunteers: required,
      };
      const res = await api.createShift(payload);
      toast.success("Shift created", `${payload.program_name} · ${res.shift_id.slice(0, 8)}`);
      onCreated?.(res.shift_id);
      onClose();
      if (autoOpenSchedule) router.push(`/shifts/${encodeURIComponent(res.shift_id)}?run=schedule`);
    } catch (e) {
      toast.error("Could not create shift", errMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button aria-label="Close" className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-shift-title"
        className="relative w-full max-w-lg rounded-t-2xl bg-white p-6 shadow-pop sm:rounded-2xl animate-fade-up"
      >
        <div className="mb-5 flex items-start justify-between">
          <div>
            <h2 id="create-shift-title" className="text-lg font-semibold text-slate-900">
              New shift
            </h2>
            <p className="text-sm text-slate-500">The Scheduler agent can start inviting people as soon as you save.</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Field label="Program" error={touched ? errors.program : undefined}>
              <input
                className={inputClass}
                placeholder="Food Bank Distribution"
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                autoFocus
              />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <Field label="Location" error={touched ? errors.location : undefined}>
              <input
                className={inputClass}
                placeholder="Community Food Bank, 123 Main St"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
              />
            </Field>
          </div>
          <Field label="Starts" error={touched ? errors.start : undefined}>
            <input type="datetime-local" className={inputClass} value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Ends" error={touched ? errors.end : undefined}>
            <input type="datetime-local" className={inputClass} value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
          <Field label="Volunteers needed" error={touched ? errors.required : undefined}>
            <input
              type="number"
              min={1}
              max={200}
              className={inputClass}
              value={required}
              onChange={(e) => setRequired(parseInt(e.target.value || "0", 10))}
            />
          </Field>
          <Field label="Required skills" hint="Press Enter to add.">
            <input
              className={inputClass}
              placeholder="food_handling"
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === ",") {
                  e.preventDefault();
                  addSkill(skillInput);
                }
              }}
              list="skill-suggestions"
            />
            <datalist id="skill-suggestions">
              {SKILL_SUGGESTIONS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </Field>
          {skills.length > 0 && (
            <div className="sm:col-span-2 -mt-2 flex flex-wrap gap-1.5">
              {skills.map((s) => (
                <Chip key={s} className="gap-1 pr-1">
                  {s.replace(/_/g, " ")}
                  <button
                    type="button"
                    onClick={() => setSkills((xs) => xs.filter((x) => x !== s))}
                    className="rounded p-0.5 hover:bg-slate-200"
                    aria-label={`Remove ${s}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </Chip>
              ))}
            </div>
          )}
        </div>

        <label className="mt-5 flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={autoOpenSchedule}
            onChange={(e) => setAutoOpenSchedule(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          Open the shift and run the Scheduler agent right away
        </label>

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon={Plus} loading={submitting} onClick={submit}>
            Create shift
          </Button>
        </div>
      </div>
    </div>
  );
}
