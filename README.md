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
EventBridge (trigger)
  |
  v
AgentCore Runtime (Strands multi-agent Graph)
  |
  +-- Scheduler Agent -----> query_volunteers, query_shifts, match_volunteers_to_shifts
  +-- Communicator Agent --> send_email (SES), send_sms (SNS), log_communication
  +-- Recovery Agent ------> query_volunteers, send_email, send_sms, notify_coordinator
  +-- Tracker Agent -------> log_hours, update_volunteer_profile, check_shift_coverage
  +-- Reporter Agent ------> generate_report
  |
  v
DynamoDB (volunteers, shifts, communications, reports, audit)
S3 (reports, audit logs, sessions)
CloudWatch (observability)
```

## Prerequisites

- Python 3.10+
- AWS account with Bedrock access (Claude Sonnet 4)
- AWS CLI configured with credentials
- DynamoDB, S3, SES, SNS permissions

## Setup

```bash
# Clone and install
git clone <repo-url>
cd vshift
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your AWS credentials and resource names

# Create DynamoDB tables and load seed data
python -m vshift.utils.seed_data
```

## Run Locally

```bash
uvicorn src.vshift.api:app --reload --port 8000
```

## Deploy to AgentCore

```bash
npm install -g @aws/agentcore
agentcore create --name vshift --framework Strands --protocol HTTP --model-provider Bedrock
agentcore deploy
```

## Run Tests

```bash
pytest
```

## License

MIT
