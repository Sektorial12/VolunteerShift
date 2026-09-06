"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Plus, RefreshCw, Search } from "lucide-react";
import { api, type Shift } from "@/lib/api";
import { usePolling, useNow, useDebounced } from "@/lib/hooks";
import { coverage, fmtDate, shiftPhase } from "@/lib/format";
import { Button, Card, EmptyState, ErrorState, PageHeader, SegmentedControl, Skeleton, cx, inputClass } from "@/components/ui";
import { ShiftCard } from "@/components/shifts/ShiftCard";
import { CreateShiftDialog } from "@/components/shifts/CreateShiftDialog";

type Filter = "all" | "attention" | "upcoming" | "past";

export default function ShiftsPage() {
  const { data, error, loading, refreshing, reload } = usePolling(() => api.shifts(), 15_000);
  const now = useNow(30_000);
  const [filter, setFilter] = useState<Filter>("upcoming");
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim().toLowerCase(), 150);
  const [creating, setCreating] = useState(false);

  const shifts = useMemo(() => {
    const all = [...(data ?? [])].sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());
    const needsAttention = (s: Shift) => {
      const c = coverage(s);
      return shiftPhase(s, now) !== "past" && s.status !== "cancelled" && (c.committed < c.required || c.noShows > 0);
    };
    const counts = {
      all: all.length,
      attention: all.filter(needsAttention).length,
      upcoming: all.filter((s) => shiftPhase(s, now) !== "past").length,
      past: all.filter((s) => shiftPhase(s, now) === "past").length,
    };
    let list = all;
    if (filter === "attention") list = all.filter(needsAttention);
    else if (filter === "upcoming") list = all.filter((s) => shiftPhase(s, now) !== "past");
    else if (filter === "past") list = all.filter((s) => shiftPhase(s, now) === "past").reverse();
    if (query) list = list.filter((s) => `${s.program_name} ${s.location} ${s.id} ${s.required_skills.join(" ")}`.toLowerCase().includes(query));
    return { list, counts };
  }, [data, filter, query, now]);

  // group by day
  const groups = useMemo(() => {
    const m = new Map<string, Shift[]>();
    for (const s of shifts.list) {
      const k = fmtDate(s.start_time);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(s);
    }
    return Array.from(m.entries());
  }, [shifts.list]);

  return (
    <>
      <PageHeader
        eyebrow="Shifts"
        title="Every shift, one screen"
        description="Coverage is counted from confirmations, not invitations. Open a shift to run an agent on it."
        actions={
          <>
            <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={() => void reload()}>
              Refresh
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
              New shift
            </Button>
          </>
        }
      />

      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SegmentedControl<Filter>
          value={filter}
          onChange={setFilter}
          options={[
            { value: "upcoming", label: "Upcoming", count: shifts.counts.upcoming },
            { value: "attention", label: "Needs attention", count: shifts.counts.attention },
            { value: "past", label: "Past", count: shifts.counts.past },
            { value: "all", label: "All", count: shifts.counts.all },
          ]}
        />
        <div className="relative sm:ml-auto sm:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={cx(inputClass, "pl-8")} placeholder="Search program, location, skill…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-2xl" />
          ))}
        </div>
      ) : shifts.list.length === 0 ? (
        <Card>
          <EmptyState
            icon={CalendarDays}
            title={query ? "No shifts match" : filter === "attention" ? "Everything is covered" : "No shifts here yet"}
            description={
              query
                ? "Try another search."
                : filter === "attention"
                  ? "Every upcoming shift has the confirmations it needs."
                  : "Create a shift and the Scheduler agent will start inviting volunteers."
            }
            action={
              !query && (
                <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
                  New shift
                </Button>
              )
            }
          />
        </Card>
      ) : (
        <div className="space-y-8">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-3 flex items-center gap-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {day}
                <span className="h-px flex-1 bg-slate-200" />
                <span className="font-medium normal-case text-slate-400">
                  {items.length} shift{items.length === 1 ? "" : "s"}
                </span>
              </h2>
              <div className="stagger grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {items.map((s) => (
                  <ShiftCard key={s.id} shift={s} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      <CreateShiftDialog open={creating} onClose={() => setCreating(false)} onCreated={() => void reload()} />
    </>
  );
}
