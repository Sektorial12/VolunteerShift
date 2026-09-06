"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  Bell,
  BrainCircuit,
  CalendarCheck,
  CheckCircle2,
  Clock,
  FileBarChart,
  Github,
  LifeBuoy,
  Mail,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
} from "lucide-react";
import { api, type AuditEntry, type Shift } from "@/lib/api";
import { usePolling, useNow } from "@/lib/hooks";
import { coverage, fmtRelative, fmtShiftWindow, toolMeta } from "@/lib/format";
import { cx, TONE_DOT } from "@/components/ui";

const REPO_URL = "https://github.com/Sektorial12/VolunteerShift";

const AGENTS = [
  {
    name: "Scheduler",
    icon: CalendarCheck,
    color: "from-sky-500 to-sky-700",
    blurb: "Reads the shift, ranks the pool by skills, availability and reliability, assigns the best fit and sends invitations.",
    tools: ["query_volunteers", "match_volunteers_to_shifts", "assign_volunteers_to_shift"],
  },
  {
    name: "Communicator",
    icon: Bell,
    color: "from-violet-500 to-violet-700",
    blurb: "Runs the 3-touch sequence: invitation, 48-hour reminder, 2-hour reminder. Email or SMS, whichever each person prefers.",
    tools: ["send_email", "send_sms", "log_communication"],
  },
  {
    name: "Recovery",
    icon: LifeBuoy,
    color: "from-amber-500 to-amber-700",
    blurb: "Watches check-ins as the shift starts. When someone does not show, it finds and contacts a replacement on its own.",
    tools: ["check_shift_coverage", "notify_coordinator"],
  },
  {
    name: "Tracker",
    icon: Clock,
    color: "from-emerald-500 to-emerald-700",
    blurb: "Logs hours from check-in to check-out and nudges reliability scores up or down so the next match is smarter.",
    tools: ["log_hours", "update_volunteer_profile"],
  },
  {
    name: "Reporter",
    icon: FileBarChart,
    color: "from-slate-500 to-slate-700",
    blurb: "Turns the week into coverage, no-show and impact numbers a board or funder actually reads.",
    tools: ["generate_report"],
  },
];

const STACK = ["Strands Agents SDK", "Amazon Bedrock AgentCore", "Mistral Large 3", "DynamoDB", "Amazon SES", "Amazon SNS", "S3", "CloudWatch"];

export default function LandingPage() {
  const dash = usePolling(() => api.dashboard(), 15_000);
  const audit = usePolling(() => api.audit(), 10_000);
  const now = useNow(10_000);

  const stats = useMemo(() => {
    const shifts = dash.data?.active_shifts ?? [];
    let seats = 0;
    for (const s of shifts) seats += Math.min(coverage(s).committed, coverage(s).required);
    return {
      shifts: dash.data?.total_shifts ?? 0,
      messages: dash.data?.total_communications ?? 0,
      toolCalls: audit.data?.length ?? 0,
      seats,
    };
  }, [dash.data, audit.data]);

  const nextShift = useMemo(() => {
    const shifts = (dash.data?.active_shifts ?? []).filter((s) => new Date(s.end_time).getTime() > now);
    return shifts.sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0] ?? null;
  }, [dash.data, now]);

  const online = !dash.error && !!dash.data;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      {/* Nav */}
      <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-sm font-semibold tracking-tight">VolunteerShift</span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-slate-600 md:flex">
            <a href="#how" className="hover:text-slate-900">
              How it works
            </a>
            <a href="#agents" className="hover:text-slate-900">
              The agents
            </a>
            <a href="#live" className="hover:text-slate-900">
              Live
            </a>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-slate-900">
              <Github className="h-4 w-4" /> Source
            </a>
          </nav>
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-slate-900 px-3.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Open dashboard <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden bg-slate-950 text-white">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-40 left-1/2 h-[560px] w-[900px] -translate-x-1/2 rounded-full bg-brand-500/20 blur-3xl" />
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
        </div>
        <div className="relative mx-auto grid max-w-6xl gap-12 px-4 pb-20 pt-20 sm:px-6 lg:grid-cols-[1.1fr_0.9fr] lg:pb-28 lg:pt-28">
          <div className="animate-fade-up">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
              <span className={cx("h-1.5 w-1.5 rounded-full", online ? "bg-brand-400 animate-pulse-dot" : "bg-slate-500")} />
              {online ? "Agents online · Amazon Bedrock AgentCore" : "Connecting to the agent runtime…"}
            </div>
            <h1 className="mt-6 text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
              Your volunteer coordinator now works{" "}
              <span className="bg-gradient-to-r from-brand-300 to-brand-500 bg-clip-text text-transparent">nights and weekends.</span>
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-300">
              VolunteerShift is an autonomous agent that schedules volunteers, sends every reminder, recovers no-shows in real
              time and tracks hours. Coordinators spend 22+ hours a week on this. The agent does it in the background and only
              surfaces when there is a real decision to make.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link
                href="/dashboard"
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-500 px-5 text-sm font-semibold text-slate-950 shadow-lg shadow-brand-500/25 hover:bg-brand-400"
              >
                See it working <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#how"
                className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 bg-white/5 px-5 text-sm font-medium text-white hover:bg-white/10"
              >
                How it works
              </a>
            </div>
            <dl className="mt-12 grid grid-cols-2 gap-6 sm:grid-cols-4">
              <Stat label="Shifts coordinated" value={stats.shifts} loading={dash.loading} />
              <Stat label="Messages sent" value={stats.messages} loading={dash.loading} />
              <Stat label="Tool calls audited" value={stats.toolCalls} loading={audit.loading} suffix={stats.toolCalls >= 200 ? "+" : ""} />
              <Stat label="Seats confirmed" value={stats.seats} loading={dash.loading} />
            </dl>
          </div>

          {/* Live agent console */}
          <div className="animate-fade-up [animation-delay:120ms]">
            <AgentConsole entries={audit.data ?? []} loading={audit.loading} now={now} nextShift={nextShift} />
          </div>
        </div>
      </section>

      {/* Logos / stack */}
      <section className="border-b border-slate-200 bg-slate-50">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 py-6 text-xs font-medium text-slate-500 sm:px-6">
          <span className="uppercase tracking-wider text-slate-400">Built on</span>
          {STACK.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5">
              <span className="h-1 w-1 rounded-full bg-slate-300" />
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="max-w-2xl">
          <p className="text-sm font-semibold text-brand-600">How it works</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Create the shift. Everything after that is automatic.</h2>
          <p className="mt-3 text-slate-600">
            Five specialised agents hand a shift down a pipeline. Each one has its own tools, its own system prompt and a hook
            that writes every tool call to an audit table before it is allowed to run.
          </p>
        </div>

        <ol className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: Workflow, title: "You post a shift", text: "Program, time, location, skills, headcount. Thirty seconds." },
            { icon: BrainCircuit, title: "Agents match and invite", text: "Best-fit volunteers get a one-tap invitation by email or SMS." },
            { icon: ShieldCheck, title: "No-shows get recovered", text: "Fifteen minutes after start, missing people trigger replacement outreach." },
            { icon: FileBarChart, title: "Hours and reports write themselves", text: "Check-in to check-out becomes hours, reliability and a weekly report." },
          ].map((s, i) => (
            <li key={s.title} className="card relative p-5">
              <span className="absolute right-4 top-4 text-xs font-semibold text-slate-300">0{i + 1}</span>
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                <s.icon className="h-4.5 w-4.5" />
              </span>
              <h3 className="mt-4 text-sm font-semibold">{s.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{s.text}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Agents */}
      <section id="agents" className="border-y border-slate-200 bg-slate-50">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="max-w-2xl">
            <p className="text-sm font-semibold text-brand-600">The agents</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">A small team that never drops a shift.</h2>
            <p className="mt-3 text-slate-600">
              Built with the Strands Agents SDK as a multi-agent graph and deployed on Amazon Bedrock AgentCore. Mistral Large 3
              does the reasoning; the tools do the work.
            </p>
          </div>
          <div className="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {AGENTS.map((a, i) => (
              <div key={a.name} className={cx("card card-hover p-5", i === 4 && "lg:col-span-1")}>
                <div className="flex items-center gap-3">
                  <span className={cx("inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br text-white shadow-sm", a.color)}>
                    <a.icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-sm font-semibold">{a.name} agent</h3>
                    <p className="text-xs text-slate-500">Step {i + 1} of 5</p>
                  </div>
                </div>
                <p className="mt-3 text-sm text-slate-600">{a.blurb}</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {a.tools.map((t) => (
                    <code key={t} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[11px] text-slate-600">
                      {t}
                    </code>
                  ))}
                </div>
              </div>
            ))}
            <div className="card flex flex-col justify-between bg-slate-900 p-5 text-white">
              <div>
                <h3 className="text-sm font-semibold">Guardrails on every call</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-300">
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" /> Recipients validated before any email or SMS leaves.
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" /> PII patterns blocked from tool inputs.
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" /> Every tool call logged with input and result.
                  </li>
                  <li className="flex gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-400" /> Agents that forget to act are re-prompted until they do.
                  </li>
                </ul>
              </div>
              <Link href="/activity" className="mt-5 inline-flex items-center gap-1.5 text-sm font-medium text-brand-300 hover:text-brand-200">
                Open the audit trail <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Why */}
      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
        <div className="grid items-center gap-10 lg:grid-cols-2">
          <div>
            <p className="text-sm font-semibold text-brand-600">Why it matters</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Built for the coordinator with 300 volunteers and no assistant.</h2>
            <p className="mt-3 text-slate-600">
              Mid-size nonprofits run on volunteers, but the person scheduling them is usually doing it between everything else.
              Reminders get missed, no-shows go unnoticed until the shift is short-handed, and the hours report is a spreadsheet
              nobody trusts.
            </p>
            <ul className="mt-6 space-y-3">
              {[
                { icon: Users, text: "Matches on skills, availability and a reliability score that learns from every shift." },
                { icon: MessageSquare, text: "Volunteers reply by email, SMS or a one-tap link. No app to install." },
                { icon: Activity, text: "Coordinators see a single ‘needs a decision’ list instead of a wall of notifications." },
                { icon: Mail, text: "Runs on the channels you already have: Amazon SES for email, SNS for SMS." },
              ].map((b) => (
                <li key={b.text} className="flex gap-3 text-sm text-slate-700">
                  <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand-50 text-brand-600">
                    <b.icon className="h-3.5 w-3.5" />
                  </span>
                  {b.text}
                </li>
              ))}
            </ul>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <BigNumber value="22+" label="hours per week coordinators spend on scheduling admin" />
            <BigNumber value="3" label="touches per volunteer: invite, 48h, 2h" />
            <BigNumber value="15 min" label="after start, the Recovery agent begins replacing no-shows" />
            <BigNumber value="100%" label="of agent tool calls land in the audit trail" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="live" className="border-t border-slate-200 bg-slate-950 text-white">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-semibold tracking-tight">Watch it run on live data.</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">
            The dashboard is connected to the real agent backend. Trigger the Scheduler on a shift and follow every tool call as it
            happens.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link href="/dashboard" className="inline-flex h-11 items-center gap-2 rounded-xl bg-brand-500 px-5 text-sm font-semibold text-slate-950 hover:bg-brand-400">
              Open the dashboard <ArrowRight className="h-4 w-4" />
            </Link>
            <a href={REPO_URL} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center gap-2 rounded-xl border border-white/15 px-5 text-sm font-medium hover:bg-white/10">
              <Github className="h-4 w-4" /> Read the code
            </a>
          </div>
        </div>
        <footer className="border-t border-white/10">
          <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-slate-400 sm:flex-row sm:px-6">
            <span>VolunteerShift · Built for the AWS Agents for Humans hackathon · MIT licence</span>
            <span className="inline-flex items-center gap-4">
              <Link href="/dashboard" className="hover:text-white">
                Dashboard
              </Link>
              <Link href="/activity" className="hover:text-white">
                Audit trail
              </Link>
              <a href={REPO_URL} target="_blank" rel="noreferrer" className="hover:text-white">
                GitHub
              </a>
            </span>
          </div>
        </footer>
      </section>
    </div>
  );
}

function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const from = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const begin = from.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const v = Math.round(begin + (target - begin) * eased);
      setValue(v);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = target;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function Stat({ label, value, loading, suffix = "" }: { label: string; value: number; loading?: boolean; suffix?: string }) {
  const v = useCountUp(value);
  return (
    <div>
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular tracking-tight">
        {loading ? <span className="inline-block h-7 w-12 animate-pulse rounded bg-white/10" /> : `${v.toLocaleString()}${suffix}`}
      </dd>
    </div>
  );
}

function BigNumber({ value, label }: { value: string; label: string }) {
  return (
    <div className="card p-5">
      <p className="text-3xl font-semibold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-sm text-slate-500">{label}</p>
    </div>
  );
}

function AgentConsole({ entries, loading, now, nextShift }: { entries: AuditEntry[]; loading: boolean; now: number; nextShift: Shift | null }) {
  const rows = entries.slice(0, 7);
  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-slate-900/70 shadow-2xl shadow-black/40 backdrop-blur">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
        <span className="h-2.5 w-2.5 rounded-full bg-brand-400/80" />
        <span className="ml-3 font-mono text-xs text-slate-400">agent audit · live</span>
        <span className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-slate-400">
          <span className="h-1.5 w-1.5 rounded-full bg-brand-400 animate-pulse-dot" /> streaming
        </span>
      </div>
      <div className="p-4 font-mono text-xs">
        {loading ? (
          <div className="space-y-2">
            {[0, 1, 2, 3, 4].map((i) => (
              <div key={i} className="h-4 animate-pulse rounded bg-white/5" style={{ width: `${70 - i * 8}%` }} />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <p className="text-slate-400">No tool calls yet. Trigger an agent from the dashboard.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((e) => {
              const m = toolMeta(e.tool_name);
              return (
                <li key={e.id} className="flex items-start gap-2 text-slate-300">
                  <span className={cx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", TONE_DOT[m.tone])} />
                  <span className="text-slate-500">{m.agent.toLowerCase()}</span>
                  <span className="text-brand-300">{e.tool_name}</span>
                  <span className="ml-auto shrink-0 text-slate-500">{fmtRelative(e.timestamp, now)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      {nextShift && (
        <div className="border-t border-white/10 bg-white/5 px-4 py-3">
          <p className="text-[11px] uppercase tracking-wide text-slate-400">Next shift</p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-white">{nextShift.program_name}</p>
              <p className="truncate text-xs text-slate-400">{fmtShiftWindow(nextShift)}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold text-white tabular">
                {coverage(nextShift).committed}
                <span className="text-slate-400">/{coverage(nextShift).required}</span>
              </p>
              <p className="text-[11px] text-slate-400">confirmed</p>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-brand-400 transition-[width] duration-700" style={{ width: `${coverage(nextShift).pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}
