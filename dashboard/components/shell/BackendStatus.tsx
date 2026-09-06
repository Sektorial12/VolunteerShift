"use client";

import { api } from "@/lib/api";
import { usePolling } from "@/lib/hooks";
import { Dot } from "@/components/ui";
import Link from "next/link";

/** Small "agent worker" health pill shown in the sidebar footer. */
export function BackendStatus() {
  const { data, error, loading } = usePolling(() => api.automationStatus(), 15_000);

  const state: { tone: "success" | "warning" | "danger" | "neutral"; label: string; sub: string } = loading
    ? { tone: "neutral", label: "Connecting…", sub: "Checking backend" }
    : error
      ? { tone: "danger", label: "Backend offline", sub: error }
      : data?.worker_running
        ? { tone: "success", label: "Agents running", sub: `Every ${data.interval_seconds}s` }
        : { tone: "warning", label: "Automation paused", sub: "Manual triggers only" };

  return (
    <Link
      href="/automation"
      className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-slate-100 transition"
      title={state.sub}
    >
      <Dot tone={state.tone} pulse={state.tone === "success"} />
      <span className="min-w-0 leading-tight">
        <span className="block text-xs font-medium text-slate-800">{state.label}</span>
        <span className="block truncate text-[11px] text-slate-500">{state.sub}</span>
      </span>
    </Link>
  );
}
