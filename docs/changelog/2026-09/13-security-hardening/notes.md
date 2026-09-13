# Security hardening (2026-09-13)

Response to the live audit (`local/security-audit-2026-09-13.md`). All fixes
deployed and verified against the live site the same evening.

## What was wrong

The API had no authentication of any kind (the proxy's `X-API-Key` header was
never read by the backend), the backend was exposed directly on plain HTTP
(`0.0.0.0:8000`, ufw-open), volunteer PII / communications / audit trails were
public, one-tap respond links were unsigned and harvestable from
`/api/communications`, and the coordinator console had no login.

## Fixes shipped

1. **API-key gate** (`src/vshift/api.py` middleware + `src/vshift/security.py`).
   Everything requires `X-API-Key` except the demo-critical public routes:
   `POST /api/ingest/volunteer` (signup), `GET /api/respond/context`,
   `POST /api/volunteers/respond` (token-gated), `GET /api/public/stats`,
   `GET /api/ping`. The dashboard proxy forwards the key server-side
   (`API_KEY` env on both services); the browser never sees it.
2. **Backend bound to localhost.** systemd drop-in
   (`vshift.service.d/bind-local.conf`) switches uvicorn to `127.0.0.1`; the
   ufw `8000/tcp` allow rules were deleted. The backend is now only reachable
   through the Next.js proxy.
3. **Docs disabled.** `docs_url`/`redoc_url`/`openapi_url` are `None`; the
   schema is unreachable even with the key.
4. **Signed respond links.** `respond_link()` appends
   `&token=HMAC(RESPOND_TOKEN_SECRET, volunteer_id:shift_id)`; both respond
   endpoints verify it (constant-time). Old links from before the deploy are
   invalid by design — the demo sends fresh invitations.
5. **Sanitized public surface.** New `GET /api/respond/context` returns only
   the first name, shift window/location/skills, and assignment status for a
   valid token; new `GET /api/public/stats` returns counters + tool names for
   the landing page. The landing and respond pages were switched to these, so
   the raw `/api/volunteers`, `/api/communications`, and `/api/audit` are no
   longer needed by any public page.
6. **Console login.** Caddy `basic_auth` on the console pages and the
   protected API paths (public API paths excluded via a `not path` matcher).
   Credentials live in the demo runbook (`local/demo-video-checklist.md`).
7. **HSTS + CSP.** HSTS at the Caddy layer (prod only, so local HTTP dev is
   not pinned); CSP in `next.config.js` (`'unsafe-eval'` only in dev).
8. **Rate limiting + error hygiene in the proxy.** In-memory sliding window
   per IP: 10/min on signup + respond, 120/min general; upstream errors are
   logged server-side and returned generically (no backend URL leak).

## Deliberate trade-offs

- **Fail-open dev mode**: if `API_KEY` / `RESPOND_TOKEN_SECRET` are unset the
  backend logs a startup warning and stays open, so local dev and tests work
  without env setup. Both are set on the VPS and the live checks below prove
  the gates are active.
- **In-memory rate limiting**: fine for the single Next.js instance; would
  need a shared store if the dashboard is ever scaled out.
- **Lambda**: `vshift-ses-inbound` env updated with `VSHIFT_API_KEY` so the
  email-reply bridge keeps working against the gated endpoint.

## Verification (live, 2026-09-13)

- `http://51.170.132.143:8000` → connection closed (was 200).
- `GET /api/volunteers` without auth → 401; with console auth → 200.
- `GET /dashboard` without auth → 401; with auth → 200.
- `GET /api/respond/context` without token → 403; with a real HMAC token →
  200, response contains no email/phone.
- `POST /api/ingest/volunteer` (invalid payload) → 422, i.e. reachable
  without auth (signup flow intact).
- `GET /api/public/stats` and `/api/ping` → 200 without auth.
- `Strict-Transport-Security` present on responses.
- Backend startup log shows no dev-mode warnings (both secrets loaded).
- Test suite: 47 passing (8 new security tests in `tests/test_api_security.py`).
