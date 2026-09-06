"use client";

import { useEffect, useRef, useState } from "react";
import { Bot, ChevronDown, ChevronUp, Play, Sparkles } from "lucide-react";
import { api, type AgentAction } from "@/lib/api";
import { AGENT_ACTIONS, AGENT_ACTION_ORDER } from "@/lib/format";
import { errMessage } from "@/lib/hooks";
import { Badge, Button, cx, TONE_SOFT } from "@/components/ui";
import { useToast } from "@/components/ui/toast";

interface RunRecord {
  action: AgentAction;
  startedAt: number;
  finishedAt?: number;
  result?: string;
  error?: string;
}

/**
 * Buttons that fire the backend agents for one shift (or the reporter with no
 * shift), plus a collapsible transcript of what the agent said back.
 */
export function AgentActions({
  shiftId,
  actions = AGENT_ACTION_ORDER.filter((a) => AGENT_ACTIONS[a].needsShift),
  onDone,
  compact,
  align = "start",
  autoRun,
}: {
  shiftId?: string;
  actions?: AgentAction[];
  onDone?: (action: AgentAction) => void;
  compact?: boolean;
  align?: "start" | "end";
  /** Fire this action once on mount (used by "?run=schedule" after creating a shift). */
  autoRun?: AgentAction | null;
}) {
  const toast = useToast();
  const [running, setRunning] = useState<AgentAction | null>(null);
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [open, setOpen] = useState(true);
  const autoFired = useRef(false);

  useEffect(() => {
    if (!autoRun || autoFired.current) return;
    if (AGENT_ACTIONS[autoRun].needsShift && !shiftId) return;
    autoFired.current = true;
    void run(autoRun);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoRun, shiftId]);

  const run = async (action: AgentAction) => {
    const meta = AGENT_ACTIONS[action];
    if (meta.needsShift && !shiftId) return;
    setRunning(action);
    const rec: RunRecord = { action, startedAt: Date.now() };
    setRuns((r) => [rec, ...r].slice(0, 5));
    try {
      const res = await api.trigger(action, meta.needsShift ? shiftId : undefined);
      rec.result = res.result;
      rec.finishedAt = Date.now();
      setRuns((r) => [...r]);
      toast.success(`${meta.agent} agent finished`, meta.label);
      onDone?.(action);
    } catch (e) {
      rec.error = errMessage(e);
      rec.finishedAt = Date.now();
      setRuns((r) => [...r]);
      toast.error(`${meta.agent} agent failed`, rec.error);
    } finally {
      setRunning(null);
    }
  };

  return (
    <div className="space-y-3">
      <div className={cx("flex flex-wrap gap-2", align === "end" && "justify-end")}>
        {actions.map((a) => {
          const meta = AGENT_ACTIONS[a];
          const isRunning = running === a;
          return (
            <Button
              key={a}
              size={compact ? "sm" : "md"}
              variant="secondary"
              onClick={() => run(a)}
              disabled={running !== null}
              loading={isRunning}
              title={meta.description}
              className="group"
            >
              {!isRunning && (
                <span className={cx("inline-flex h-5 w-5 items-center justify-center rounded-md", TONE_SOFT[meta.tone])}>
                  <Play className="h-3 w-3" />
                </span>
              )}
              {meta.label}
            </Button>
          );
        })}
      </div>

      {running && (
        <div className="flex items-center gap-2 rounded-xl border border-dashed border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
          <Sparkles className="h-3.5 w-3.5 animate-pulse text-brand-600" />
          <span>
            <span className="font-medium text-slate-800">{AGENT_ACTIONS[running].agent} agent</span> is reasoning and calling
            tools. Large-model runs can take up to a minute.
          </span>
        </div>
      )}

      {runs.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 rounded-t-xl"
          >
            <span className="inline-flex items-center gap-1.5">
              <Bot className="h-3.5 w-3.5" /> Agent transcript
              <Badge tone="neutral">{runs.length}</Badge>
            </span>
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          {open && (
            <div className="divide-y divide-slate-100 border-t border-slate-100">
              {runs.map((r) => {
                const meta = AGENT_ACTIONS[r.action];
                const secs = r.finishedAt ? ((r.finishedAt - r.startedAt) / 1000).toFixed(1) : null;
                return (
                  <div key={r.startedAt} className="px-3 py-2.5">
                    <div className="mb-1.5 flex items-center gap-2 text-xs">
                      <Badge tone={meta.tone} dot>
                        {meta.agent}
                      </Badge>
                      <span className="text-slate-500">{meta.label}</span>
                      <span className="flex-1" />
                      {secs ? (
                        <span className="tabular text-slate-400">{secs}s</span>
                      ) : (
                        <span className="text-slate-400">running…</span>
                      )}
                    </div>
                    {r.error ? (
                      <p className="text-xs text-rose-600 break-words">{r.error}</p>
                    ) : r.result ? (
                      <pre className="scroll-thin max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-2.5 font-mono text-[11px] leading-relaxed text-slate-700">
                        {r.result.trim()}
                      </pre>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
