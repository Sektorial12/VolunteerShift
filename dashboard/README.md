# VolunteerShift dashboard

Next.js 15 (App Router) + React 19 + Tailwind. This is the coordinator-facing app,
the public landing page, and the volunteer response page. It is a separate service
from the FastAPI backend. In production both run on the same VPS behind Caddy,
which serves the public site at `https://volshift.xyz`.

## Quick start

```bash
npm install
cp .env.example .env.local     # API_URL=http://localhost:8000
npm run dev                    # http://localhost:3000
```

Production build (the gate before every push — it type-checks the whole app):

```bash
npm run build
API_URL=http://localhost:8000 npm start     # on the VPS: backend is on the same box
API_URL=https://volshift.xyz npm start      # from your machine, against the live API
```

## How it talks to the backend

The browser **never** calls the backend directly. Every request goes to this app's
own origin under `/api/...`, and the route handler at `app/api/[...path]/route.ts`
forwards it to `API_URL`.

```
browser ──/api/dashboard──► Next.js route handler ──► $API_URL/api/dashboard
```

Four reasons this matters:

1. **Transport.** The public site is HTTPS, but the proxy reaches the backend over
   plain HTTP on loopback (`http://localhost:8000`) — the fast path, and it never
   leaves the box. The backend binds to `127.0.0.1`, so the proxy is the only way in.
   A browser is never asked to make a plain-HTTP call from an HTTPS page, which
   Chrome blocks silently as mixed content.
2. **CORS.** No origin needs to be added to `CORS_ORIGINS` for the dashboard.
   (Keep the env var for other clients; the dashboard no longer needs it.)
3. **Runtime config.** `API_URL` is read per request, so the backend address can
   change with a restart. It is *not* baked into the JS bundle.
4. **Choke point.** The proxy attaches `X-API-Key` server-side — the browser never
   sees it — and rate-limits per client IP: 10 requests a minute on the public write
   endpoints (`ingest/volunteer`, `volunteers/respond`), 120 a minute on everything
   else.

| Env var | Where | Meaning |
|---|---|---|
| `API_URL` | server only | Backend base URL the proxy forwards to. **Set this on the host.** On the VPS it is `http://localhost:8000`. |
| `NEXT_PUBLIC_API_URL` | server only | Legacy name from the first handover; still honoured as the proxy target. |
| `API_KEY` | server only | **Required in production.** Attached upstream as `X-API-Key`; must equal the backend's `API_KEY`. Never sent to the browser. |
| `NEXT_PUBLIC_API_DIRECT_URL` | browser | Escape hatch: call the backend directly and skip the proxy. Needs CORS + HTTPS. Normally unset. |

The proxy allows 180s upstream, because a `/api/trigger` call runs a large model and
can take a minute. It returns `502` when the backend is unreachable, `504` on timeout
and `429` when rate-limited, all as `{"detail": "..."}` with a generic message. The real
cause is logged server-side, so the backend address never reaches the browser.

## Routes

| Path | Group | What it is |
|---|---|---|
| `/` | public | Landing page. Live agent console, pipeline walkthrough, stack. |
| `/signup` | public | Volunteer self-signup form — enters the pool the Scheduler matches against (upserts by email). |
| `/respond?volunteer_id=..&shift_id=..&token=..` | public | One-tap confirm / decline for a volunteer. `token` is an HMAC the backend signs into the emailed link; without it the page shows "Invitation not found". No admin chrome, no nav. |
| `/dashboard` | app | Overview: needs-a-decision list, coverage, live tool calls. |
| `/shifts`, `/shifts/[id]` | app | List with filters; detail with roster, check-in/out, agent triggers. |
| `/volunteers`, `/volunteers/[id]` | app | Pool with skill filters; profile with history and availability. |
| `/communications` | app | Every message, filterable by channel and type. |
| `/activity` | app | Audit trail: every tool call with parsed input and result. |
| `/reports`, `/reports/[id]` | app | Reporter output with trends. |
| `/automation` | app | Worker status, countdown, rules, manual cycle. |

Route groups keep the two audiences apart: `app/(public)/` has no sidebar, so a
volunteer opening an invitation never sees links to other volunteers' PII.
`app/(app)/` is the coordinator shell.

## Layout of the code

```
app/(public)/        landing + signup + respond (no console chrome)
app/(app)/           coordinator shell + pages
app/api/[...path]/   backend proxy (server-side)
components/ui/       design system: Button, Card, Badge, StatCard, toasts…
components/shell/    sidebar, topbar, command palette, backend status
components/shifts/   ShiftCard, CoverageMeter, LifecycleTrail, Roster, CreateShiftDialog
components/agents/   AgentActions (trigger buttons + transcript)
lib/api.ts           typed client — every endpoint and entity
lib/format.ts        dates, status metadata, coverage maths, audit parsing
lib/hooks.ts         usePolling, useNow, useDebounced, useAction
```

Add new endpoints to `lib/api.ts`, not inline `fetch` calls. Status labels and
colours live in `lib/format.ts` so a status is styled the same everywhere.

## Things worth knowing about the data

**Coverage is computed from confirmations, not from `status`.** The backend flips a
shift to `filled` when volunteers are *assigned*, before anyone replies, and it tends
to assign roughly double the required headcount. So `coverage()` in `lib/format.ts`
counts assignments that are `confirmed`, `checked_in` or `checked_out` against
`required_volunteers`. A shift the API calls `filled` will correctly read `0/5` here
until people actually confirm. If the scheduler is ever changed to hold `open` until
confirmations arrive, this UI needs no change.

**Invitation emails carry a signed `/respond` link.** The backend's `invite`
automation action emails every matched volunteer their own
`/respond?volunteer_id=..&shift_id=..&token=..` URL, where `token` is
`HMAC-SHA256(RESPOND_TOKEN_SECRET, volunteer_id:shift_id)`. Tokens are redacted from
every API response the console reads, so the console cannot copy or mint a working
link — which is why the roster has no "copy link" button. Volunteers can also reply
YES / NO to the email; SES inbound applies it.

**The console shows masked PII.** `/api/volunteers`, `/api/communications` and
`/api/audit` return emails as `j***@example.org`, phones as `+1***11`, no notes, and
`token=redacted` inside any free text. The raw records stay in DynamoDB.

**Audit `result` is double-encoded.** It is `json.dumps(str(python_dict))`, so it
arrives as a string containing a Python repr. `auditResultText()` unwraps it to show
the tool's actual JSON payload on `/activity`.

**Numbers are plain JSON numbers** (the backend converts DynamoDB `Decimal` on read),
but `lib/format.ts` still coerces defensively.

## Keyboard

`⌘K` / `Ctrl+K` (or `/`) opens the command palette: jump to any page, shift or
volunteer. `↑` `↓` to move, `↵` to open, `esc` to close.

## Status of the gaps listed in the original handover

| Gap | Now |
|---|---|
| No `next.config.js`, no security headers | Added: CSP, `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`; HSTS at the Caddy layer |
| No API proxy | Added, at `app/api/[...path]/route.ts` |
| `NEXT_PUBLIC_API_URL` baked at build time | Fixed — `API_URL` is read at request time |
| Some pages use `any` | Gone. Every entity is typed in `lib/api.ts` |
| No error boundaries / skeletons | Added: `error.tsx` per group, `global-error.tsx`, `loading.tsx`, skeletons on every page |
| `lib/api.ts` types were duplicated per page | All pages import the shared types |
| No auth — dashboard fully open | Backend API-key gate (the proxy attaches the key), signed respond links, masked PII, per-IP rate limiting. The console itself stays public for judging — see below. |

### The console is public on purpose

A login in front of the coordinator pages was tried (Caddy basic auth) and removed:
Next.js prefetches console routes from the public landing page, so every `401` popped
the browser's password dialog. The trade-off taken instead is *sanitize, don't gate*:
anyone can open the console and run an agent, but they see masked PII, cannot build a
working respond link, and are rate-limited. A real deployment should put the console
behind SSO (for example Amazon Cognito) and keep `/`, `/signup` and `/respond` public.

## Requests for the backend

Small changes that would make the UI tell a truer story:

1. ~~Include the `/respond` URL in invitation and reminder email bodies.~~ **Done** — the `invite` automation action embeds each volunteer's exact link (backend `PUBLIC_DASHBOARD_URL`).
2. Hold shift `status` at `open` / `partially_filled` until confirmations arrive,
   rather than flipping to `filled` on assignment.
3. Assign close to `required_volunteers`, not double.
4. Return the audit `result` as real JSON instead of a stringified Python dict.
5. Confirm the automation interval — config says 30s, the live server reports 60s.
