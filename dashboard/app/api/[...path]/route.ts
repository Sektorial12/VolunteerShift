import type { NextRequest } from "next/server";

/**
 * Same-origin proxy for the FastAPI backend.
 *
 * The browser only ever talks to this dashboard's origin (/api/...). This handler
 * forwards the call to the backend and streams the response back. Benefits:
 *   - An HTTPS-hosted dashboard can talk to the plain-HTTP VPS (no mixed content).
 *   - No CORS configuration needed on the backend for the dashboard origin.
 *   - The backend URL is read at *request* time, so it can change without a rebuild.
 *
 * Configure with API_URL (preferred, server-only). NEXT_PUBLIC_API_URL is honoured
 * for backwards compatibility with the original handover instructions.
 */

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Agent triggers run a large model and can take a while. Hosts cap this per plan.
export const maxDuration = 60;

const UPSTREAM_TIMEOUT_MS = 180_000;

function target(): string {
  return (process.env.API_URL || process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");
}

async function proxy(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }): Promise<Response> {
  const { path } = await ctx.params;
  const incoming = new URL(req.url);
  const upstream = `${target()}/api/${path.map(encodeURIComponent).join("/")}${incoming.search}`;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  headers.set("accept", req.headers.get("accept") ?? "application/json");
  const apiKey = process.env.API_KEY;
  if (apiKey) headers.set("x-api-key", apiKey);

  const init: RequestInit = {
    method: req.method,
    headers,
    cache: "no-store",
    redirect: "manual",
    signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
  };
  if (req.method !== "GET" && req.method !== "HEAD") {
    init.body = await req.text();
  }

  try {
    const res = await fetch(upstream, init);
    const out = new Headers();
    const resType = res.headers.get("content-type");
    if (resType) out.set("content-type", resType);
    out.set("cache-control", "no-store");
    return new Response(res.body, { status: res.status, statusText: res.statusText, headers: out });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const timedOut = /timeout|aborted/i.test(message);
    return Response.json(
      {
        detail: timedOut
          ? `The backend took longer than ${UPSTREAM_TIMEOUT_MS / 1000}s to answer.`
          : `Backend unreachable at ${target()} (${message}). Set API_URL on the dashboard host.`,
      },
      { status: timedOut ? 504 : 502, headers: { "cache-control": "no-store" } },
    );
  }
}

export { proxy as GET, proxy as POST, proxy as PUT, proxy as PATCH, proxy as DELETE };
