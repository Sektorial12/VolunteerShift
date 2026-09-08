# Production hardening — 2026-09-08

Follow-up to the live volshift.xyz deployment: closes the inbound-email path,
makes the README match the deployed system, and adds a demo reset.

## Inbound email bridge (deployed + verified)

- `vshift-ses-inbound` Lambda deployed (python3.12, role `vshift-ses-inbound-role`)
  and subscribed to the `vshift-inbound-mail` SNS topic behind the
  `volshift-xyz-inbound` SES receipt rule. `VSHIFT_API_BASE=https://volshift.xyz`,
  so replies flow through the dashboard's same-origin `/api` proxy.
- Verified end to end with an SES loopback send
  (`coordinator@volshift.xyz -> inbound-probe@volshift.xyz`, subject `[s001] ...`,
  body `YES`): Lambda parsed the shift id and POSTed to
  `/api/ingest/email-reply`; backend correctly reported volunteer-not-found for
  the probe sender. Volunteers who reply YES/NO to invitation emails are now
  applied to their assignments.
- Fixed `deploy-ses-inbound.sh`: an empty `VSHIFT_API_KEY` produced an invalid
  `--environment` value and aborted the deploy before the SNS subscribe step.

## README truth pass

- Live demo URL (`https://volshift.xyz`) added to the intro; AgentCore claim
  corrected (VPS + Caddy is the live deployment, AgentCore path documented).
- Architecture diagram redrawn to the real flow: public `/signup` + `/respond`
  surfaces, Caddy HTTPS, same-origin `/api` proxy, automation worker as the
  orchestrator alongside manual triggers, inbound reply loop.
- SES section: verified domain identity + sandbox/production-access reality;
  SNS topic step marked optional (`send_sms` publishes direct-to-number);
  session managers documented as available-but-not-wired; S3 sessions bucket
  optional; `Deploy` section now points at `infra/DEPLOYMENT.md` and the Lambda
  script instead of placeholder CLI commands; tech-stack versions corrected.

## Dependencies

- `strands-agents` / `strands-agents[openai]` pinned to `==1.52.0`:
  `vshift.agents.model` imports the private `strands.models._openai_bedrock`
  module, so the SDK must not float.

## Demo reset utility

- `python -m vshift.utils.seed_data --reset` wipes all five tables, then
  reseeds 50 volunteers and 5 shifts with dates recomputed from today, so a
  demo starts clean with a future-dated lifecycle (invite -> 48h reminder ->
  no-show check -> track).
- Root-caused a first-run race: `create_table_if_not_exists` returned while the
  table was still CREATING, so the immediate seed writes failed. It now calls
  `wait_until_exists()`.
- Verified on throwaway `vshift-test-*` tables (junk rows cleared, extras gone,
  counts 50/5/0/0/0, `s001` future-dated, flags fresh); test tables deleted.
  Unit suite: 27 passed.

## Scheduler stall — root cause and fix (found during live e2e test)

A live test (fresh volunteer + fresh shift, picked up by the automation worker)
stalled: the shift was marked scheduled with zero assignments, so `invite`
never fired. The audit trail showed the Scheduler agent had queried
`query_volunteers(day="friday")` — it computed the shift's weekday itself and
got it wrong (the shift is on a Saturday), concluded "no candidates" from the
correctly-empty result, and then failed to call `assign_volunteers_to_shift`
even across both reliability-hook resumes.

Fixes:

- The automation `schedule` prompt now routes the agent through
  `match_volunteers_to_shifts` (which handles skills/availability matching
  internally) instead of inviting the model to filter by day itself.
- `db.scan` now uses `ConsistentRead=True` so a volunteer written seconds
  before a cycle (the /signup -> auto-schedule demo flow) can never be
  invisible to the agent's first read.

Verified live after deploying: manual trigger ran the full chain —
`match_volunteers_to_shifts` -> `assign_volunteers_to_shift` (1/1 assigned,
shift filled) -> `send_email` (SES message id, status sent) ->
`log_communication`, with `invitations_sent` persisted on the shift.

The volunteer then confirmed via the emailed one-tap `/respond` link and the
assignment flipped to `confirmed` — the complete autonomous loop (signup ->
schedule -> match -> assign -> invite email delivered to the inbox -> one-tap
confirm) is verified end to end against the live deployment.

## SMS: future integration (decision)

SNS accepts `publish --phone-number` calls but every SMS-related API
(`GetSMSSandboxAccountStatus`, `GetSMSAttributes`, `ListOriginationNumbers`,
and `pinpoint-sms-voice-v2 describe-account-attributes`) returns
`SubscriptionRequiredException` — the account has no AWS End-User Messaging
subscription, so publishes are silently dead-lettered. Fixing it needs the
End-User Messaging subscription, sandbox OTP verification, and (for US
numbers) carrier origination registration measured in days-to-weeks.

Decision: email is the demo channel (the fully verified loop); SMS is a
planned future integration. Changes: the public signup form offers email only
(a viewer picking SMS would get a dead-lettered "invitation" that reports
`sent`), `send_sms` carries a docstring stating the provisioning requirement,
and the README frames SMS as implemented-but-future.

