"use client";

import { useParams } from "next/navigation";
import { Clock, FileText, TrendingUp, Users, CalendarDays } from "lucide-react";
import { api } from "@/lib/api";
import { usePolling } from "@/lib/hooks";
import { fmtDate, fmtDateTime, humanize, num, pct } from "@/lib/format";
import { Badge, Card, CardHeader, ErrorState, PageHeader, ProgressBar, Skeleton, StatCard } from "@/components/ui";

function rate(v: unknown): number {
  const n = Number(v) || 0;
  return n <= 1 ? n * 100 : n;
}

export default function ReportDetailPage() {
  const params = useParams<{ id: string }>();
  const id = decodeURIComponent(params.id);
  const { data: r, error, reload } = usePolling(() => api.report(id), null, [id]);

  if (error && !r) {
    return (
      <>
        <PageHeader backHref="/reports" backLabel="Reports" title="Report" />
        <ErrorState message={error} onRetry={() => void reload()} />
      </>
    );
  }
  if (!r) {
    return (
      <>
        <PageHeader backHref="/reports" backLabel="Reports" title={<Skeleton className="h-8 w-72" />} />
        <Skeleton className="h-64 rounded-2xl" />
      </>
    );
  }

  const cov = rate(r.coverage_rate);
  const ns = rate(r.no_show_rate);
  const attendance = Math.max(0, 100 - ns);

  return (
    <>
      <PageHeader
        backHref="/reports"
        backLabel="Reports"
        eyebrow={<span className="font-mono normal-case text-slate-400">{r.id}</span>}
        title={
          <span className="inline-flex flex-wrap items-center gap-3">
            {humanize(r.period)} report
            <Badge tone={r.period === "monthly" ? "violet" : "info"}>
              {fmtDate(r.start_date)} – {fmtDate(r.end_date)}
            </Badge>
          </span>
        }
        description={`Generated ${fmtDateTime(r.generated_at)} by the Reporter agent`}
      />

      <div className="stagger grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Shifts in period" value={num(r.total_shifts)} icon={CalendarDays} tone="info" />
        <StatCard label="Unique volunteers" value={num(r.total_volunteers)} icon={Users} tone="violet" />
        <StatCard label="Hours delivered" value={num(r.total_hours, 1)} icon={Clock} tone="success" />
        <StatCard label="Avg hours / volunteer" value={r.total_volunteers ? num(Number(r.total_hours) / Number(r.total_volunteers), 1) : "—"} icon={TrendingUp} tone="neutral" />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader icon={TrendingUp} title="Coverage" subtitle="Confirmed seats over required seats" />
          <p className="text-4xl font-semibold tabular tracking-tight text-slate-900">{pct(r.coverage_rate)}</p>
          <ProgressBar value={cov} tone={cov >= 90 ? "success" : cov >= 70 ? "warning" : "danger"} className="mt-3" />
          <p className="mt-2 text-xs text-slate-500">
            {cov >= 90 ? "Excellent. Shifts were staffed as planned." : cov >= 70 ? "Some shifts ran short. Check the pool size for the required skills." : "Coverage was low. Consider widening availability windows or recruiting."}
          </p>
        </Card>
        <Card>
          <CardHeader icon={Users} title="Attendance" subtitle="Share of confirmed volunteers who showed up" />
          <p className="text-4xl font-semibold tabular tracking-tight text-slate-900">{attendance.toFixed(0)}%</p>
          <ProgressBar value={attendance} tone={ns <= 10 ? "success" : ns <= 20 ? "warning" : "danger"} className="mt-3" />
          <p className="mt-2 text-xs text-slate-500">No-show rate {ns.toFixed(1)}%. The Recovery agent starts replacing no-shows 15 minutes after start.</p>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader icon={FileText} title="Raw report" subtitle="Exactly what the agent stored" />
        <pre className="scroll-thin max-h-80 overflow-auto rounded-lg bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-100">{JSON.stringify(r, null, 2)}</pre>
      </Card>
    </>
  );
}
