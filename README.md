# VolunteerShift (Vshift)

Autonomous volunteer coordination agent for mid-size nonprofits, built with the Strands Agents SDK: a five-agent system (Scheduler, Communicator, Recovery, Tracker, Reporter) that runs the volunteer shift lifecycle end to end on AWS (DynamoDB, S3, SES, SNS, CloudWatch).

**Live demo:** <https://volshift.xyz> — volunteer sign-up at [`/signup`](https://volshift.xyz/signup), one-tap confirm/decline at `/respond`, coordinator console at [`/dashboard`](https://volshift.xyz/dashboard). The backend runs as a systemd service behind Caddy (automatic HTTPS); a Bedrock AgentCore Runtime deployment path is also included (see [Deploy](#deploy)).

## What It Does

VolunteerShift manages the entire volunteer shift lifecycle autonomously:

1. **Scheduling**: Matches volunteers to shifts based on skills, availability, and reliability
2. **Communication**: Sends personalized email invitations and reminders (3-touch sequence); SMS tooling is implemented for a future channel
3. **No-Show Recovery**: Detects no-shows and autonomously finds/contact replacements
4. **Hour Tracking**: Logs volunteer hours and updates reliability scores
5. **Reporting**: Generates weekly/monthly coverage and impact reports

The agent runs in the background and only surfaces to the coordinator when there's a real decision to make.

## Who It's For

Volunteer coordinators at mid-size nonprofits ($500K-$10M budget, 50-500 volunteers) who currently spend 22+ hours/week on administrative scheduling tasks.

## Architecture

```
 Volunteers (public)                       Coordinator
   |                                          |
   v                                          v
 /signup  /respond              https://volshift.xyz (Caddy, HTTPS)
   |                                          |
   +----------------> Next.js dashboard <-----+
                           |   same-origin /api proxy
                           v
                    FastAPI server (api.py)
                           |
           +---------------+------------------+
           |                                  |
    Automation worker                   Manual triggers
    (60s cycle, idempotent,            (dashboard /
     due-action dispatch)              POST /api/trigger)
           |                                  |
           +---------------+------------------+
                           v
            Strands multi-agent system
      Scheduler -> Communicator -> Recovery
                 -> Tracker -> Reporter
      (dedicated tools + prompts + audit hooks,
       Mistral Large 3 on Bedrock via Mantle API)
                           |
     +---------+---------+---------+---------+
     v         v         v         v         v
  DynamoDB    S3       SES       SNS     CloudWatch
  (5 tables,  (reports) (outbound (SMS)   (metrics
   state of              email)            + OTel)
   record)
                           ^
                           |
     Inbound replies: MX -> SES receipt rule -> SNS
     -> Lambda (vshift-ses-inbound) -> /api/ingest/email-reply
```

### Agent Graph

```
Scheduler Agent
  Tools: query_volunteers, query_shifts, get_shift, get_volunteer, match_volunteers_to_shifts, assign_volunteers_to_shift
  Role: Match volunteers to shifts by skills, availability, reliability
       |
       v
Communicator Agent
  Tools: send_email, send_sms, log_communication, notify_coordinator
  Role: Send personalized invitations and reminders (3-touch sequence)
       |
       v
Recovery Agent
  Tools: check_shift_coverage, query_volunteers, match_volunteers_to_shifts, get_shift, send_email, send_sms, log_communication, notify_coordinator
  Role: Detect no-shows and find replacement volunteers
       |
       v
Tracker Agent
  Tools: check_shift_coverage, get_shift, log_hours, update_volunteer_profile
  Role: Log volunteer hours and update reliability scores
       |
       v
Reporter Agent
  Tools: query_shifts, generate_report
  Role: Generate weekly/monthly coverage and impact reports
```

### Observability

Custom CloudWatch metrics are emitted under the `Vshift` namespace:

| Metric | Unit | Description |
|--------|------|-------------|
| `shifts_coordinated` | Count | Shifts processed by Scheduler Agent |
| `no_shows_detected` | Count | No-shows detected by Recovery Agent |
| `no_shows_recovered` | Count | No-shows successfully recovered |
| `hours_logged` | None | Volunteer hours logged by Tracker Agent |
| `communications_sent` | Count | Emails/SMS sent by Communicator Agent |

### Hooks

- **BeforeToolCallEvent**: Validates recipients for communication tools (blocks invalid emails/phone numbers)
- **AfterToolCallEvent**: Logs all tool calls to DynamoDB audit table with timestamp, tool name, input, and result

### Session Management

`vshift.agents.sessions` ships both an S3-backed and a file-backed session manager.
The current deployment runs agents statelessly — every automation action is a
discrete task and business state lives in DynamoDB — so no session persistence is
wired into the live path; the managers are covered by the unit tests.

## Prerequisites

- Python 3.10+
- AWS account with Bedrock access
- AWS CLI configured with credentials (`aws configure`)
- IAM permissions for: Bedrock, DynamoDB, S3, SES, SNS, CloudWatch
- Node.js 20+ (for dashboard)

## Setup

### 1. Clone and install backend

```bash
git clone <repo-url>
cd vshift
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pip install -e .
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your values:
# - AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
# - AWS_BEARER_TOKEN_BEDROCK (Bedrock API key from console)
# - BEDROCK_MODEL_ID (default: mistral.mistral-large-3-675b-instruct)
# - SES_SOURCE_EMAIL (a verified SES identity, e.g. coordinator@volshift.xyz)
# - SNS_TOPIC_ARN (optional; see 2b below)
# - PUBLIC_DASHBOARD_URL (where volunteers can open /respond links, e.g. http://localhost:3000)
```

### 2a. Configure SES

The live deployment sends from `coordinator@volshift.xyz` behind the verified
domain identity `volshift.xyz`. Until SES **production access** is granted the
account stays in sandbox: the sender and every recipient mailbox must be
verified identities.

```bash
# Verify a sending domain (then add the DKIM/SPF DNS records it shows you)
aws ses verify-domain-identity --domain yourdomain.org

# Sandbox fallback: verify each inbox you want to deliver to (e.g. your demo inbox)
aws ses verify-email-identity --email-address your-email@example.com
aws ses get-identity-verification-attributes --identities your-email@example.com
```

Inbound replies (the "reply YES or NO" option in invitation emails) are fully
wired: MX -> SES receipt rule -> SNS -> Lambda -> `/api/ingest/email-reply`.
Deploy the bridge with `infra/lambda/deploy-ses-inbound.sh`.

### 2b. (Optional) SNS topic for SMS

`send_sms` publishes directly to phone numbers in E.164 format, so no topic is
required. `SNS_TOPIC_ARN` is read by the config for future fan-out use only.

Note: SMS is a planned future integration. Actual SMS delivery requires AWS
SMS provisioning on the account (AWS End-User Messaging subscription plus
origination for the destination country), which the demo account does not
have — the verified live channel is email (invitation + reminders + one-tap
confirm). The `send_sms` tool path is implemented and exercised by the
Communicator/Recovery agents when a volunteer prefers SMS.

```bash
aws sns create-topic --name vshift-sms
# Copy the TopicArn into .env as SNS_TOPIC_ARN if you want it configured
```

### 3. Create S3 buckets

The app stores generated reports in S3 (audit logs live in the DynamoDB `vshift-audit` table, not S3):

```bash
aws s3 mb s3://vshift-reports    # Reporter output
aws s3 mb s3://vshift-sessions   # optional: only needed if session persistence is wired
```

### 4. Create DynamoDB tables and load seed data

```bash
source .venv/bin/activate
export $(grep -v '^#' .env | xargs)
PYTHONPATH=src python3 -m vshift.utils.seed_data
```

This creates 5 DynamoDB tables (volunteers, shifts, communications, reports, audit) and loads 50 volunteer profiles + 5 shifts.

### 5. Set up the dashboard

```bash
cd dashboard
npm install
cp .env.example .env.local     # API_URL=http://localhost:8000 by default
cd ..
```

The dashboard never calls the backend from the browser directly. Every request goes
to the dashboard origin under `/api/...` and a route handler
(`dashboard/app/api/[...path]/route.ts`) forwards it to `API_URL` at request time.
That means:

- no CORS entry is needed for the dashboard origin,
- an HTTPS-hosted dashboard can talk to the plain-HTTP VPS, and
- `API_URL` is runtime config: change it on the host and restart, no rebuild.

`NEXT_PUBLIC_API_URL` from the original setup is still honoured as the proxy target.
Full frontend documentation lives in [`dashboard/README.md`](dashboard/README.md).

## Run Locally

### Start the API server

```bash
source .venv/bin/activate
export $(grep -v '^#' .env | xargs)
PYTHONPATH=src uvicorn vshift.api:app --reload --port 8000
```

### Start the dashboard

```bash
cd dashboard
npm run dev          # http://localhost:3000
npm run build        # must pass before shipping
API_URL=http://localhost:8000 npm start    # production build; on the VPS the dashboard runs under systemd with this same value, behind Caddy
```

Routes:

| Path | What it is |
|------|------------|
| `/` | Public landing page with a live agent console |
| `/signup` | Public volunteer sign-up form (enters the pool the Scheduler matches against) |
| `/respond?volunteer_id=..&shift_id=..` | Public one-tap confirm / decline page for volunteers (no admin chrome) |
| `/dashboard` | Coordinator overview: needs-a-decision list, confirmed-seat coverage, live tool calls |
| `/shifts`, `/shifts/[id]` | Shift list with filters; detail with roster, check-in/out, agent triggers, respond links |
| `/volunteers`, `/volunteers/[id]` | Pool with skill filters; profile with history, availability, messages |
| `/communications` | Every message the agents sent, by channel and type |
| `/activity` | Audit trail of every tool call with parsed input and result |
| `/reports`, `/reports/[id]` | Reporter output with trends |
| `/automation` | Worker status, countdown, rules, manual cycle |

Coverage everywhere is counted from **confirmed** assignments over required seats, not
from the shift `status` field, so a shift the backend marks `filled` still shows `0/5`
until volunteers actually confirm.

### Trigger agent actions

Via the dashboard, or via API:

```bash
# Schedule volunteers for a shift (also sends the invitation emails with
# one-tap confirm links, same as the automation worker)
curl -X POST http://localhost:8000/api/trigger \
  -H "Content-Type: application/json" \
  -d '{"action": "schedule", "shift_id": "s001"}'

# Send reminders
curl -X POST http://localhost:8000/api/trigger \
  -H "Content-Type: application/json" \
  -d '{"action": "remind", "shift_id": "s001"}'

# Check for no-shows
curl -X POST http://localhost:8000/api/trigger \
  -H "Content-Type: application/json" \
  -d '{"action": "noshow_check", "shift_id": "s001"}'

# Generate weekly report
curl -X POST http://localhost:8000/api/trigger \
  -H "Content-Type: application/json" \
  -d '{"action": "report"}'
```

## Deploy

Two supported paths:

- **VPS (the current live deployment)** — FastAPI as a systemd service, dashboard
  on the same origin behind Caddy for automatic HTTPS (`https://volshift.xyz`).
- **Amazon Bedrock AgentCore Runtime** — Docker image -> ECR -> runtime deploy,
  including the account service-quota prerequisites. Full runbook:
  [`infra/DEPLOYMENT.md`](infra/DEPLOYMENT.md).

Inbound email bridge (SES -> SNS -> Lambda -> `/api/ingest/email-reply`):

```bash
VSHIFT_API_BASE=https://your-host infra/lambda/deploy-ses-inbound.sh
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard` | Dashboard state (active shifts, recent communications) |
| POST | `/api/shifts` | Create a new shift |
| GET | `/api/shifts` | List all shifts |
| GET | `/api/shifts/{id}` | Get shift details |
| POST | `/api/shifts/{id}/checkin` | Volunteer check-in |
| POST | `/api/shifts/{id}/checkout` | Volunteer check-out |
| GET | `/api/volunteers` | List all volunteers |
| GET | `/api/volunteers/{id}` | Get volunteer details |
| POST | `/api/volunteers/respond` | Volunteer confirm/decline invitation |
| GET | `/api/communications` | List all communications |
| GET | `/api/audit` | Agent audit trail (tool call history, newest first) |
| GET | `/api/reports` | List all reports |
| GET | `/api/reports/{id}` | Get report details |
| POST | `/api/trigger` | Trigger agent action (schedule, remind, noshow_check, track, report) |
| POST | `/api/ingest/shift` | Ingest a shift from an external system (dedupes) |
| POST | `/api/ingest/volunteer` | Ingest a volunteer (upserts by email) |
| POST | `/api/ingest/email-reply` | Apply a volunteer email reply (confirm/decline) |
| POST | `/api/automation/run` | Run the automation cycle manually |
| GET | `/api/automation/status` | Automation worker status |
| GET | `/api/ping` | Health check |

## Run Tests

### Unit tests (no AWS required)

```bash
source .venv/bin/activate
PYTHONPATH=src pytest tests/test_models.py tests/test_agents.py -v
```

### Integration tests (requires AWS)

```bash
source .venv/bin/activate
export $(grep -v '^#' .env | xargs)
PYTHONPATH=src pytest tests/test_integration.py -v
```

## Tech Stack

- **Agent Framework**: Strands Agents SDK (Python), pinned to v1.52.0 (OpenAI-compatible provider against the Bedrock Mantle API)
- **LLM**: Mistral Large 3 675B via Amazon Bedrock (Mantle API)
- **Backend**: FastAPI, Python 3.10+ (inbound Lambda bridge runs 3.12)
- **Frontend**: Next.js 15, React 19, Tailwind CSS, Lucide icons
- **Database**: Amazon DynamoDB (5 tables)
- **Storage**: Amazon S3 (reports)
- **Email**: Amazon SES (outbound via verified domain; inbound via receipt rule + Lambda)
- **SMS**: Amazon SNS direct-to-number publishing (implemented; future integration pending AWS SMS provisioning)
- **Deployment**: Oracle Cloud VPS (systemd + Caddy HTTPS) at https://volshift.xyz; AgentCore Runtime path in `infra/DEPLOYMENT.md`
- **License**: MIT
