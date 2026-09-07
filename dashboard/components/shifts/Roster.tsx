"use client";

import { useState } from "react";
import { Check, Link2, LogIn, LogOut, Users } from "lucide-react";
import { api, type Assignment } from "@/lib/api";
import { errMessage } from "@/lib/hooks";
import { assignmentStatusMeta, fmtDateTime } from "@/lib/format";
import { Badge, Button, EmptyState } from "@/components/ui";
import { useToast } from "@/components/ui/toast";
import { VolunteerName } from "@/components/volunteers/VolunteerDirectory";

/** Statuses from which a coordinator may still mark someone present. */
const CAN_CHECK_IN = ["confirmed", "invited", "no_response", "no_show", "replaced"];

export function Roster({
  shiftId,
  assignments,
  onChanged,
}: {
  shiftId: string;
  assignments: Assignment[];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const checkInOut = async (a: Assignment, kind: "in" | "out") => {
    setBusy(`${a.volunteer_id}:${kind}`);
    try {
      if (kind === "in") await api.checkIn(shiftId, a.volunteer_id);
      else await api.checkOut(shiftId, a.volunteer_id);
      toast.success(kind === "in" ? "Checked in" : "Checked out");
      onChanged();
    } catch (e) {
      toast.error("Could not update attendance", errMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const copyRespondLink = async (volunteerId: string) => {
    const url = `${window.location.origin}/respond?volunteer_id=${encodeURIComponent(volunteerId)}&shift_id=${encodeURIComponent(shiftId)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(volunteerId);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      toast.info("Invitation link", url);
    }
  };

  if (assignments.length === 0) {
    return (
      <EmptyState
        compact
        icon={Users}
        title="No volunteers assigned yet"
        description="Run the Scheduler agent to match and invite the best-fit volunteers."
      />
    );
  }

  const Actions = ({ a }: { a: Assignment }) => {
    const canOut = a.status === "checked_in";
    return (
      <>
        <Button
          size="sm"
          variant="ghost"
          icon={copied === a.volunteer_id ? Check : Link2}
          title="Copy this volunteer's one-tap response link"
          onClick={() => copyRespondLink(a.volunteer_id)}
        >
          {copied === a.volunteer_id ? "Copied" : "Link"}
        </Button>
        {canOut ? (
          <Button size="sm" variant="secondary" icon={LogOut} loading={busy === `${a.volunteer_id}:out`} onClick={() => checkInOut(a, "out")}>
            Check out
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            icon={LogIn}
            disabled={!CAN_CHECK_IN.includes(a.status)}
            loading={busy === `${a.volunteer_id}:in`}
            onClick={() => checkInOut(a, "in")}
          >
            Check in
          </Button>
        )}
      </>
    );
  };

  return (
    <>
      {/* Mobile: stacked cards, no horizontal scrolling */}
      <ul className="space-y-2 md:hidden">
        {assignments.map((a) => {
          const m = assignmentStatusMeta(a.status);
          return (
            <li key={a.volunteer_id} className="rounded-xl border border-slate-100 p-3">
              <div className="flex items-start justify-between gap-2">
                <VolunteerName id={a.volunteer_id} />
                <Badge tone={m.tone} dot>
                  {m.label}
                </Badge>
              </div>
              {(a.confirmed_at || a.checked_in_at || a.checked_out_at) && (
                <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-500">
                  {a.confirmed_at && (
                    <div className="flex gap-1">
                      <dt>Confirmed</dt>
                      <dd className="tabular text-slate-700">{fmtDateTime(a.confirmed_at)}</dd>
                    </div>
                  )}
                  {a.checked_in_at && (
                    <div className="flex gap-1">
                      <dt>In</dt>
                      <dd className="tabular text-slate-700">{fmtDateTime(a.checked_in_at)}</dd>
                    </div>
                  )}
                  {a.checked_out_at && (
                    <div className="flex gap-1">
                      <dt>Out</dt>
                      <dd className="tabular text-slate-700">{fmtDateTime(a.checked_out_at)}</dd>
                    </div>
                  )}
                </dl>
              )}
              <div className="mt-2.5 flex items-center gap-1.5">
                <Actions a={a} />
              </div>
            </li>
          );
        })}
      </ul>

      {/* Desktop: full table */}
      <div className="-mx-5 hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-[11px] uppercase tracking-wide text-slate-400">
              <th className="px-5 py-2 font-medium">Volunteer</th>
              <th className="px-3 py-2 font-medium">Status</th>
              <th className="px-3 py-2 font-medium">Confirmed</th>
              <th className="px-3 py-2 font-medium">In</th>
              <th className="px-3 py-2 font-medium">Out</th>
              <th className="px-5 py-2 text-right font-medium">Attendance</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {assignments.map((a) => {
              const m = assignmentStatusMeta(a.status);
              return (
                <tr key={a.volunteer_id} className="hover:bg-slate-50/60">
                  <td className="px-5 py-2.5">
                    <VolunteerName id={a.volunteer_id} />
                  </td>
                  <td className="px-3 py-2.5">
                    <Badge tone={m.tone} dot>
                      {m.label}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 text-xs tabular text-slate-500">{a.confirmed_at ? fmtDateTime(a.confirmed_at) : "—"}</td>
                  <td className="px-3 py-2.5 text-xs tabular text-slate-500">{a.checked_in_at ? fmtDateTime(a.checked_in_at) : "—"}</td>
                  <td className="px-3 py-2.5 text-xs tabular text-slate-500">{a.checked_out_at ? fmtDateTime(a.checked_out_at) : "—"}</td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center justify-end gap-1.5">
                      <Actions a={a} />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
