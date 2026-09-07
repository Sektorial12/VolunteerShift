# VolunteerShift dashboard

Next.js 15 (App Router) + React 19 + Tailwind. This is the coordinator-facing app,
the public landing page, and the volunteer response page. It is a separate service
from the FastAPI backend and talks to it over HTTP.

## Quick start

```bash
npm install
cp .env.example .env.local     # API_URL=http://localhost:8000
npm run dev                    # http://localhost:3000
```

Production build (the gate before every push — it type-checks the whole app):

```bash
npm run build
API_URL=http://51.170.132.143:8000 npm start
```

## How it talks to the backend

The browser **never** calls the backend directly. Every request goes to this app's
own origin under `/api/...`, and the route handler at `app/api/[...path]/route.ts`
forwards it to `API_URL`.

```
browser ──/api/dashboard──► Next.js route handler ──► $API_URL/api/dashboard
```

Three reasons this matters:

1. **Mixed content.** A dashboard served over HTTPS cannot call `http://51.170.132.143:8000`
   from the browser; Chrome blocks it silently. Server-side forwarding is exempt.
2. **CORS.** No origin needs to be added to `CORS_ORIGINS` for the dashboard.
   (Keep the env var for other clients; the dashboard no longer needs it.)
3. **Runtime config.** `API_URL` is read per request, so the backend address can
   change with a restart. It is *not* baked into the JS bundle.

| Env var | Where | Meaning |
|---|---|---|
| `API_URL` | server only | Backend base URL the proxy forwards to. **Set this on the host.** |
| `NEXT_PUBLIC_API_URL` | server only | Legacy name from the first handover; still honoured as the proxy target. |
| `API_KEY` | server only | Optional. Sent upstream as `X-API-Key` if the backend ever requires auth. |
| `NEXT_PUBLIC_API_DIRECT_URL` | browser | Escape hatch: call the backend directly and skip the proxy. Needs CORS + HTTPS. Normally unset. |

The proxy allows 180s upstream, because a `/api/trigger` call runs a large model and
can take a minute. It returns `502` when the backend is unreachable and `504` on
timeout, both as `{"detail": "..."}` so the UI shows a real message.

## Routes

| Path | Group | What it is |
|---|---|---|
| `/` | public | Landing page. Live agent console, pipeline walkthrough, stack. |
| `/signup` | public | Volunteer self-signup form — enters the pool the Scheduler matches against (upserts by email). |
| `/respond?volunteer_id=..&shift_id=..` | public | One-tap confirm / decline for a volunteer. No admin chrome, no nav. |
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
app/(public)/        landing + respond          (no auth chrome)
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

**Invitation emails now carry the `/respond` link.** The backend's `invite`
automation action sends every matched volunteer a personalized email containing
their exact `/respond?volunteer_id=..&shift_id=..` URL (built from the backend's
`PUBLIC_DASHBOARD_URL` env), so the confirm loop closes without the coordinator.
Volunteers can also just reply YES/NO to the email once SES inbound is live.
The roster **Link** button still copies the same URL for manual sharing.

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
| No `next.config.js`, no security headers | Added: `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` |
| No API proxy | Added, at `app/api/[...path]/route.ts` |
| `NEXT_PUBLIC_API_URL` baked at build time | Fixed — `API_URL` is read at request time |
| Some pages use `any` | Gone. Every entity is typed in `lib/api.ts` |
| No error boundaries / skeletons | Added: `error.tsx` per group, `global-error.tsx`, `loading.tsx`, skeletons on every page |
| `lib/api.ts` types were duplicated per page | All pages import the shared types |
| **No auth — dashboard fully open** | **Still open.** See below. |

### Auth is still the open item

Anyone who can reach the dashboard can trigger agents and read volunteer PII. Note
that the proxy means exposing the dashboard also exposes the API through it, so
putting auth only on the backend is not enough on its own. Cheapest credible options
before the demo goes public: a Cloudflare Access / Vercel password in front of the
whole deployment, or basic auth in Next.js middleware plus a shared secret the proxy
forwards as `API_KEY`. `/respond` must stay public either way.

## Requests for the backend

Small changes that would make the UI tell a truer story:

1. ~~Include the `/respond` URL in invitation and reminder email bodies.~~ **Done** — the `invite` automation action embeds each volunteer's exact link (backend `PUBLIC_DASHBOARD_URL`).
2. Hold shift `status` at `open` / `partially_filled` until confirmations arrive,
   rather than flipping to `filled` on assignment.
3. Assign close to `required_volunteers`, not double.
4. Return the audit `result` as real JSON instead of a stringified Python dict.
5. Confirm the automation interval — config says 30s, the live server reports 60s.
