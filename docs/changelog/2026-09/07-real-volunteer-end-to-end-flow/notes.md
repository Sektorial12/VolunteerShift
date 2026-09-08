# 2026-09-07 — Real volunteer end-to-end flow

## Goal

Close the loop for real volunteers: self-signup → automatic matching → invitation
email with a one-tap confirm link → confirmation → reminders. Before this change,
`assign_volunteers_to_shift` only wrote `INVITED` rows — nothing ever emailed the
volunteers, and there was no public signup path.

## Changes

### Backend

- `config.py`: new `PUBLIC_DASHBOARD_URL` (default `http://localhost:3000`). Used to
  build `/respond?volunteer_id=..&shift_id=..` links embedded in agent-sent emails.
- `models/entities.py`: `Shift.invitations_sent` flag (defaults False on old rows).
- `automation.py`:
  - New `invite` action: Communicator emails every `invited` volunteer. Idempotent via
    `invitations_sent`. Due whenever invited-but-uncontacted assignments exist (not
    COMPLETED/CANCELLED).
  - `respond_link()` helper + `_communicator_context()`: pre-fetches shift + volunteer
    contact info and builds the task prompt. **Design decision:** the Communicator has
    no query tools, so the caller hands it real data with exact emails/links instead of
    letting the model look up (or invent) addresses. Rejected alternative: giving the
    Communicator `get_shift`/`get_volunteer` tools — more tool round-trips and a
    hallucination risk on addresses; the pre-fetch keeps sends deterministic.
  - `remind_48h`/`remind_2h` now also get pre-fetched confirmed-volunteer data (they
    previously had none — the agent could not know who to remind).
  - Empty recipient set (e.g. zero confirmed volunteers) marks the flag done and skips
    the model call instead of forcing a bogus send.
  - `run_due_cycle` re-reads the shift after each action so `invite` fires in the same
    cycle as `schedule`; a failed action breaks that shift's loop and retries next cycle.
- `api.py` `/api/trigger`: shift actions now delegate to `automation.run_action` so
  manual and automatic runs share prompts/hooks/idempotency. Manual `schedule` also
  runs `invite` (gated by `invitations_pending` so a failed schedule cannot mark
  invitations as sent). Response adds `results` list; `result` stays a string for the
  dashboard. `report` unchanged.
- `agents/prompts.py`: COMMUNICATOR_SYSTEM_PROMPT rewritten — use only provided
  addresses, copy the respond link verbatim, reply-YES/NO fallback, log every send
  with the correct `message_type`, skip MISSING RECORD lines.

### Frontend

- New public page `app/(public)/signup/page.tsx`: volunteer self-signup (name, email,
  phone, skills chips + free text, day×slot availability matrix, channel preference)
  posting to `/api/ingest/volunteer` (upserts by email). Uses the same skill/day/slot
  vocabulary as the seed data and the Scheduler matcher.
- `lib/api.ts`: `signupVolunteer`, `VolunteerSignupInput`, `Shift.invitations_sent`.
- Landing page: signup links in header nav, hero CTA, footer.
- Automation page: rules list split — Scheduler matches/assigns; Communicator invites
  right after assignment (was previously claimed but not implemented).

## Verification

- `pytest tests/test_models.py tests/test_automation.py tests/test_agents.py
  tests/test_ingestion.py` — 34 passed (new: invite due/not-due cases, respond link
  format, invitations_sent roundtrip + old-row default).
- `npm run build` — passes, 12 routes including `/signup`.
- Read-only smoke against live DynamoDB: `_communicator_context` produced correct
  volunteer lines + links for all 5 seeded shifts.
- NOT verified: a full live `invite` run (needs Bedrock model call + SES). Expect the
  first cycle after deploy to send invitations for the existing backtest shifts —
  re-seed first if you want a clean demo (sandbox SES will reject the @example.org
  recipients).

## Live deployment (2026-09-07, verified)

Deployed to the Oracle VPS via commit `3009717` + rsync (the VPS `~/vshift` is not a
git clone; `.env`/`.venv` preserved), `PUBLIC_DASHBOARD_URL=http://localhost:3000`
added, service restarted. First automation cycle fired `invite` for all 5 backtest
shifts and behaved exactly as designed:

- Every `invited`-status volunteer got an invitation logged (9 invitation comms);
  2 SES-rejected sends were escalated as `coordinator_notification` instead
- s003 (all volunteers already confirmed from backtesting) correctly skipped the
  invite (marked done, "no invited volunteers")
- All shifts now show `invitations_sent: true`; no cycle errors
- Invitation bodies contained the exact `/respond` link and the YES/NO reply fallback
- Known quirk: the agent's final narrative claimed one @example.org send "succeeded"
  when SES rejected it — trust the comms table, not the agent's self-report
- All SES deliveries to @example.org fail (sandbox + unverified domain), as expected;
  the flow itself is complete, delivery is the external blocker

## Public deployment (2026-09-08, verified)

`volshift.xyz` now serves the dashboard over HTTPS from the VPS:

- DNS A record flipped to the VPS; Caddy (v2.11.4, Cloudsmith apt repo) reverse-proxies
  the domain to the dashboard service; Let's Encrypt cert auto-issued and auto-renews
- Two firewall layers had to allow 80/443: host iptables (Oracle image default is
  policy DROP with per-port allows — rules added and persisted via netfilter-persistent)
  and the VNIC's NSG (ingress 80/443 added via `oci network nsg rules add`; the user's
  earlier console change had not landed on either the NSG or the subnet security list)
- `vshift-dashboard` systemd service runs the Next.js build on 127.0.0.1:3000 with
  `API_URL=http://localhost:8000` (runtime config via the /api route handler)
- VPS tree had stale pre-route-group `app/` pages shadowing the build — fixed by
  rsyncing with `--delete` (VPS-unique files `.env`/`.venv`/`node_modules` excluded)
- `PUBLIC_DASHBOARD_URL=https://volshift.xyz` set in the VPS `.env`; backend restarted
- Verified through the domain: landing 200, `/signup` 200, `/respond` 200,
  `/api/shifts/s001` + `/api/volunteers/v001` data path, `respond_link()` emits the
  https URL

Remaining for real email delivery: SES production access (console request, still
pending as of this note). The entire dashboard (including admin pages) is now public
on the domain — add auth or accept the exposure for the demo.
