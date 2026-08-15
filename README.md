# VolunteerShift (Vshift)

Autonomous volunteer coordination agent for mid-size nonprofits. Built with the Strands Agents SDK and deployed on Amazon Bedrock AgentCore.

## What It Does

VolunteerShift manages the entire volunteer shift lifecycle autonomously:

1. **Scheduling**: Matches volunteers to shifts based on skills, availability, and reliability
2. **Communication**: Sends personalized email/SMS invitations and reminders (3-touch sequence)
3. **No-Show Recovery**: Detects no-shows and autonomously finds/contact replacements
4. **Hour Tracking**: Logs volunteer hours and updates reliability scores
5. **Reporting**: Generates weekly/monthly coverage and impact reports

The agent runs in the background and only surfaces to the coordinator when there's a real decision to make.

## Who It's For

Volunteer coordinators at mid-size nonprofits ($500K-$10M budget, 50-500 volunteers) who currently spend 22+ hours/week on administrative scheduling tasks.

## Architecture

```
                    +-------------------+
                    |   Web Dashboard   |
                    |  (Next.js/React)  |
                    +--------+----------+
                             |
                             v
                    +--------+----------+
                    |   FastAPI Server  |
                    |  (api.py)         |
                    +--------+----------+
                             |
                             v
          +------------------+------------------+
          |     Multi-Agent Graph (Strands)     |
          |                                      |
          |  Scheduler -> Communicator ->        |
          |  Recovery -> Tracker -> Reporter     |
          |                                      |
          |  Each agent has dedicated tools,     |
          |  system prompts, and audit hooks     |
          +------------------+------------------+
                             |
          +------------------+------------------+
          |                                      |
          v                                      v
  +-------+------+                       +-------+-------+
  |  DynamoDB    |                       |  AWS SES      |
  |  (5 tables)  |                       |  (Email)      |
  +--------------+                       +---------------+
          |                                      |
          v                                      v
  +-------+------+                       +-------+-------+
  |  Amazon S3   |                       |  AWS SNS      |
  |  (Reports,   |                       |  (SMS)        |
  |   Sessions)  |                       +---------------+
  +--------------+
          |
          v
  +-------+------+
  |  Bedrock     |
  |  (Mistral    |
  |   Large 3)   |
  +--------------+
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

- **S3SessionManager**: Production session persistence across agent invocations
- **FileSessionManager**: Local development session persistence

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
# - SES_SOURCE_EMAIL (must be verified in SES sandbox)
# - SNS_TOPIC_ARN (from step 2b below)
```

### 2a. Verify SES email addresses (sandbox mode)

SES sandbox requires both sender and recipient emails to be verified:

```bash
# Verify the source email (sender)
aws ses verify-email-identity --email-address coordinator@vshift.example.org

# Verify each volunteer email you want to send to (for demo, use emails you control)
aws ses verify-email-identity --email-address your-email@example.com

# Check verification status
aws ses get-identity-verification-attributes --identities coordinator@vshift.example.org
```

### 2b. Create SNS topic for SMS

```bash
# Create the topic
aws sns create-topic --name vshift-sms

# Copy the TopicArn from the output and set it in .env as SNS_TOPIC_ARN
# Note: SNS SMS requires phone numbers in E.164 format (e.g., +15551234567)
```

### 3. Create S3 buckets

The app uses 2 S3 buckets for reports and session state (audit logs are stored in the DynamoDB `vshift-audit` table, not S3):

```bash
aws s3 mb s3://vshift-reports
aws s3 mb s3://vshift-sessions
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
# Create .env.local with the API URL:
echo 'NEXT_PUBLIC_API_URL=http://localhost:8000' > .env.local
cd ..
```

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
npm run dev
```

Open http://localhost:3000 to view the dashboard.

### Trigger agent actions

Via the dashboard, or via API:

```bash
# Schedule volunteers for a shift
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

## Deploy to AgentCore

```bash
npm install -g @aws/agentcore
agentcore create --name vshift --framework Strands --protocol HTTP --model-provider Bedrock
agentcore deploy
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

- **Agent Framework**: Strands Agents SDK (Python) v1.52.0
- **LLM**: Mistral Large 3 675B via Amazon Bedrock (Mantle API)
- **Backend**: FastAPI, Python 3.12
- **Frontend**: Next.js 15, React 19, Tailwind CSS, Lucide icons
- **Database**: Amazon DynamoDB (5 tables)
- **Storage**: Amazon S3 (reports, session state)
- **Email**: Amazon SES
- **SMS**: Amazon SNS
- **Deployment**: Amazon Bedrock AgentCore Runtime
- **License**: MIT
