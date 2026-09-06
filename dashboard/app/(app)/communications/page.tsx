"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Mail, MessageSquare, Monitor, RefreshCw, Search, Send } from "lucide-react";
import { api } from "@/lib/api";
import { usePolling, useNow, useDebounced } from "@/lib/hooks";
import { fmtDate, fmtDateTime, fmtRelative, humanize, messageTypeMeta } from "@/lib/format";
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SegmentedControl, SkeletonRows, StatCard, cx, inputClass } from "@/components/ui";
import { VolunteerName, useVolunteerDirectory } from "@/components/volunteers/VolunteerDirectory";

type ChannelFilter = "all" | "email" | "sms" | "dashboard";
type TypeFilter = "all" | "invitation" | "reminder" | "urgent_replacement" | "coordinator_notification" | "confirmation";

const CHANNEL_ICON = { email: Mail, sms: MessageSquare, dashboard: Monitor } as const;

export default function CommunicationsPage() {
  const { data, error, loading, refreshing, reload } = usePolling(() => api.communications(), 15_000);
  const now = useNow(15_000);
  const { byId } = useVolunteerDirectory();
  const [channel, setChannel] = useState<ChannelFilter>("all");
  const [type, setType] = useState<TypeFilter>("all");
  const [q, setQ] = useState("");
  const query = useDebounced(q.trim().toLowerCase(), 150);

  const all = useMemo(() => [...(data ?? [])].sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime()), [data]);

  const stats = useMemo(() => {
    const dayAgo = now - 864e5;
    return {
      total: all.length,
      email: all.filter((c) => c.channel === "email").length,
      sms: all.filter((c) => c.channel === "sms").length,
      last24h: all.filter((c) => new Date(c.sent_at).getTime() > dayAgo).length,
      replied: all.filter((c) => !!c.response).length,
    };
  }, [all, now]);

  const list = useMemo(() => {
    return all.filter((c) => {
      if (channel !== "all" && c.channel !== channel) return false;
      if (type === "reminder" ? !c.message_type.startsWith("reminder") : type !== "all" && c.message_type !== type) return false;
      if (query) {
        const name = byId.get(c.volunteer_id)?.name ?? "";
        if (!`${name} ${c.volunteer_id} ${c.shift_id} ${c.content} ${c.message_type}`.toLowerCase().includes(query)) return false;
      }
      return true;
    });
  }, [all, channel, type, query, byId]);

  const groups = useMemo(() => {
    const m = new Map<string, typeof list>();
    for (const c of list) {
      const k = fmtDate(c.sent_at);
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(c);
    }
    return Array.from(m.entries());
  }, [list]);

  return (
    <>
      <PageHeader
        eyebrow="Communications"
        title="Every message the agents sent"
        description="Invitations, reminders and recovery outreach across email and SMS."
        actions={
          <Button variant="secondary" icon={RefreshCw} loading={refreshing} onClick={() => void reload()}>
            Refresh
          </Button>
        }
      />

      <div className="stagger mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <StatCard label="Total sent" value={stats.total} icon={Send} tone="violet" loading={loading} />
        <StatCard label="Last 24 hours" value={stats.last24h} icon={RefreshCw} tone="info" loading={loading} />
        <StatCard label="Email / SMS" value={`${stats.email} / ${stats.sms}`} icon={Mail} tone="neutral" loading={loading} />
        <StatCard label="With a reply" value={stats.replied} icon={MessageSquare} tone="success" loading={loading} hint="Replies recorded on the message" />
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <SegmentedControl<ChannelFilter>
          value={channel}
          onChange={setChannel}
          options={[
            { value: "all", label: "All channels" },
            { value: "email", label: "Email" },
            { value: "sms", label: "SMS" },
            { value: "dashboard", label: "Dashboard" },
          ]}
        />
        <SegmentedControl<TypeFilter>
          value={type}
          onChange={setType}
          options={[
            { value: "all", label: "All types" },
            { value: "invitation", label: "Invites" },
            { value: "reminder", label: "Reminders" },
            { value: "urgent_replacement", label: "Recovery" },
            { value: "coordinator_notification", label: "Alerts" },
          ]}
        />
        <div className="relative lg:ml-auto lg:w-72">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input className={cx(inputClass, "pl-8")} placeholder="Search volunteer, shift, text…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {error && !data && <ErrorState message={error} onRetry={() => void reload()} />}

      {loading ? (
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <EmptyState icon={Mail} title={all.length === 0 ? "No messages yet" : "No messages match"} description={all.length === 0 ? "Run the Scheduler on a shift to send the first invitations." : "Try a different filter."} />
        </Card>
      ) : (
        <div className="space-y-6">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                {day}
                <span className="h-px flex-1 bg-slate-200" />
                <span className="tabular font-medium normal-case text-slate-400">{items.length}</span>
              </h2>
              <Card padded={false} className="divide-y divide-slate-100">
                {items.map((c) => {
                  const m = messageTypeMeta(c.message_type);
                  const Icon = CHANNEL_ICON[c.channel as keyof typeof CHANNEL_ICON] ?? Send;
                  return (
                    <article key={c.id} className="flex gap-3 px-4 py-3">
                      <span className="mt-1 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500">
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <VolunteerName id={c.volunteer_id} size="sm" subtitle={null} />
                          <Badge tone={m.tone}>{m.label}</Badge>
                          <Link href={`/shifts/${encodeURIComponent(c.shift_id)}`} className="font-mono text-[11px] text-slate-400 hover:text-slate-700 hover:underline">
                            {c.shift_id}
                          </Link>
                          <span className="ml-auto text-[11px] tabular text-slate-400" title={fmtDateTime(c.sent_at)}>
                            {fmtRelative(c.sent_at, now)}
                          </span>
                        </div>
                        <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-slate-700">{c.content}</p>
                        {c.response && (
                          <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-md bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-700">
                            Replied: {humanize(c.response)}
                            {c.responded_at && <span className="font-normal text-brand-600/70">· {fmtRelative(c.responded_at, now)}</span>}
                          </p>
                        )}
                      </div>
                    </article>
                  );
                })}
              </Card>
            </section>
          ))}
        </div>
      )}
    </>
  );
}
