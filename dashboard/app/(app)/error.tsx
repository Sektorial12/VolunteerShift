"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button, Card } from "@/components/ui";

/**
 * Route-level error boundary for the coordinator app. A thrown render error in
 * any page under (app) lands here instead of blanking the screen mid-demo.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Dashboard route error:", error);
  }, [error]);

  const looksLikeBackend = /fetch|network|502|504|unreachable|ECONN/i.test(error.message);

  return (
    <div className="mx-auto max-w-lg py-12">
      <Card className="text-center">
        <span className="mx-auto inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-rose-50 text-rose-600">
          <AlertTriangle className="h-5 w-5" />
        </span>
        <h1 className="mt-4 text-lg font-semibold text-slate-900">This page hit an error</h1>
        <p className="mt-1 text-sm text-slate-500">
          {looksLikeBackend
            ? "The dashboard could not reach the agent backend. It may be restarting."
            : "Something went wrong rendering this view. The rest of the dashboard still works."}
        </p>
        <pre className="scroll-thin mt-4 max-h-32 overflow-auto rounded-lg bg-slate-50 p-3 text-left font-mono text-[11px] leading-relaxed text-slate-600">
          {error.message}
          {error.digest ? `\n\ndigest: ${error.digest}` : ""}
        </pre>
        <div className="mt-5 flex justify-center gap-2">
          <Button variant="primary" icon={RefreshCw} onClick={reset}>
            Try again
          </Button>
          <Link
            href="/dashboard"
            className="inline-flex h-9 items-center rounded-lg bg-white px-3.5 text-sm font-medium text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50"
          >
            Back to overview
          </Link>
        </div>
      </Card>
    </div>
  );
}
