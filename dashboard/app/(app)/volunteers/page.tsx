"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Mail, Phone, RefreshCw, Search, Users, ChevronRight } from "lucide-react";
import type { Volunteer } from "@/lib/api";
import { useDebounced } from "@/lib/hooks";
import { humanize, num, pct, reliabilityTone } from "@/lib/format";
import { Avatar, Badge, Button, Card, Chip, EmptyState, ErrorState, PageHeader, ProgressBar, SegmentedControl, Skeleton, cx, inputClass } from "@/components/ui";
import { useVolunteerDirectory } from "@/components/volunteers/VolunteerDirectory";

type Sort = "reliability" | "hours" | "name";
type StatusFilter = "all" | "active" | "pending" | "inactive";

export default function VolunteersPage() {
  const { volunteers, loading, error, reload } = useVolunteerDirectory();
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim().toLowerCase(), 150);
  const [sort, setSort] = useState<Sort>("reliability");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [skill, setSkill] = useState<string>("");

  const skills = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of volunteers) for (const s of v.skills ?? []) m.set(s, (m.get(s) ?? 0) + 1);
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [volunteers]);

  const list = useMemo(() => {
    let xs = volunteers;
    if (status !== "all") xs = xs.filter((v) => v.status === status);
    if (skill) xs = xs.filter((v) => v.skills?.includes(skill));
    if (query) xs = xs.filter((v) => `${v.name} ${v.email} ${v.phone} ${v.skills?.join(" ")}`.toLowerCase().includes(query));
    return [...xs].sort((a, b) => {
      if (sort === "name") return a.name.localeCompare(b.name);
      if (sort === "hours") return Number(b.total_hours) - Number(a.total_hours);
      return Number(b.reliability_score) - Number(a.reliability_score);
    });
  }, [volunteers, status, skill, query, sort]);

  const counts = useMemo(
    () => ({
      all: volunteers.length,
      active: volunteers.filter((v) => v.status === "active").length,
      pending: volunteers.filter((v) => v.status === "pending").length,
      inactive: volunteers.filter((v) => v.status === "inactive").length,
    }),
    [volunteers],
  );

  const avgReliability = volunteers.length ? volunteers.reduce((s, v) => s + Number(v.reliability_score || 0), 0) / volunteers.length : 0;
  const totalHours = volunteers.reduce((s, v) => s + Number(v.total_hours || 0), 0);

  return (
    <>
      <PageHeader
        eyebrow="Volunteers"
        title="The pool"
        description={
          loading ? "Loading…" : `${counts.active} active · average reliability ${pct(avgReliability)} · ${num(totalHours, 0)} hours logged all-time`
        }
        actions={
          <Button variant="secondary" icon={RefreshCw} onClick={() => void reload()}>
            Refresh
          </Button>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SegmentedControl<StatusFilter>
          value={status}
          onChange={setStatus}
          options={[
            { value: "all", label: "All", count: counts.all },
            { value: "active", label: "Active", count: counts.active },
            { value: "pending", label: "Pending", count: counts.pending },
            { value: "inactive", label: "Inactive", count: counts.inactive },
          ]}
        />
        <SegmentedControl<Sort>
          value={sort}
          onChange={setSort}
          options={[
            { value: "reliability", label: "Most reliable" },
            { value: "hours", label: "Most hours" },
            { value: "name", label: "A–Z" },
          ]}
        />
        <div className="relative lg:ml-auto lg:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={cx(inputClass, "pl-8")} placeholder="Search name, email, skill…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {skills.length > 0 && (
        <div className="scroll-thin mb-5 flex gap-1.5 overflow-x-auto pb-1">
          <button
            onClick={() => setSkill("")}
            className={cx("shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset", !skill ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50")}
          >
            All skills
          </button>
          {skills.map(([s, n]) => (
            <button
              key={s}
              onClick={() => setSkill(skill === s ? "" : s)}
              className={cx(
                "shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                skill === s ? "bg-slate-900 text-white ring-slate-900" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
              )}
            >
              {humanize(s)} <span className={cx("tabular", skill === s ? "text-slate-300" : "text-slate-400")}>{n}</span>
            </button>
          ))}
        </div>
      )}

      {error && volunteers.length === 0 && <ErrorState message={error} onRetry={() => void reload()} />}

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <Skeleton key={i} className="h-36 rounded-2xl" />
          ))}
        </div>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={Users} title="No volunteers match" description="Try clearing a filter or the search box." />
        </Card>
      ) : (
        <div className="stagger grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((v) => (
            <VolunteerCard key={v.id} v={v} />
          ))}
        </div>
      )}
    </>
  );
}

function VolunteerCard({ v }: { v: Volunteer }) {
  const score = Number(v.reliability_score) || 0;
  const tone = reliabilityTone(score);
  return (
    <Link href={`/volunteers/${encodeURIComponent(v.id)}`} className="card card-hover group block p-4">
      <div className="flex items-start gap-3">
        <Avatar name={v.name} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-sm font-semibold text-slate-900">{v.name}</h3>
            {v.status !== "active" && <Badge tone={v.status === "pending" ? "warning" : "neutral"}>{humanize(v.status)}</Badge>}
          </div>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-3 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1 truncate">
              <Mail className="h-3 w-3" /> {v.email}
            </span>
            {v.phone && (
              <span className="inline-flex items-center gap-1">
                <Phone className="h-3 w-3" /> {v.phone}
              </span>
            )}
          </p>
        </div>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500" />
      </div>
      <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-3">
        <div>
          <div className="mb-1 flex justify-between text-[11px] text-slate-500">
            <span>Reliability</span>
            <span className="tabular font-medium text-slate-700">{pct(score)}</span>
          </div>
          <ProgressBar value={score * 100} tone={tone} size="sm" />
        </div>
        <div className="text-right">
          <p className="text-sm font-semibold tabular text-slate-900">{num(v.total_hours, 1)}h</p>
          <p className="text-[11px] text-slate-500">{v.past_shifts?.length ?? 0} shifts</p>
        </div>
      </div>
      {(v.skills?.length ?? 0) > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {v.skills.slice(0, 4).map((s) => (
            <Chip key={s}>{humanize(s)}</Chip>
          ))}
          {v.skills.length > 4 && <Chip>+{v.skills.length - 4}</Chip>}
        </div>
      )}
    </Link>
  );
}
