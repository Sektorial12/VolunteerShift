# Vshift AgentCore Deployment Runbook

Deploys the Vshift multi-agent system to Amazon Bedrock AgentCore Runtime.

## Prerequisites

- AWS CLI + credentials with ECR / AgentCore / IAM permissions
- Docker available locally
- AWS credits or billing enabled for Bedrock + ECR

## Step 1: Build the image

```bash
cd /home/spektor/code/agentshack/code
docker build -t vshift:latest .
```

Verify locally (AgentCore app binds to port **8080**):

```bash
docker run --rm -d --name vshift-smoke \
  --env AWS_BEARER_TOKEN_BEDROCK=true \
  --env AWS_REGION=us-east-1 \
  -p 8100:8080 vshift:latest
curl -s http://localhost:8100/ping   # -> {"status":"Healthy"}
docker rm -f vshift-smoke
```

## Step 2: Push to ECR

```bash
REGION=us-east-1
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin \
  $ACCOUNT.dkr.ecr.$REGION.amazonaws.com

aws ecr create-repository --repository-name vshift --region $REGION || true
docker tag vshift:latest $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/vshift:latest
docker push $ACCOUNT.dkr.ecr.$REGION.amazonaws.com/vshift:latest
```

## Step 3: Deploy to AgentCore

```bash
npm install -g @aws/agentcore
agentcore create --name vshift --framework Strands --protocol HTTP --model-provider Bedrock
agentcore deploy
```

Alternatively use the AgentCore console: point the deployment at the ECR image URI above.

## Step 4: Environment variables

The deployment must set these (from `.env.example`):

| Variable | Value |
|----------|-------|
| `AWS_REGION` | `us-east-1` |
| `AWS_BEARER_TOKEN_BEDROCK` | `true` (use Mantle API) |
| `BEDROCK_MODEL_ID` | `mistral.mistral-large-3-675b-instruct` |
| `DDB_*_TABLE` | `vshift-{volunteers,shifts,communications,reports,audit}` |
| `S3_*_BUCKET` | `vshift-{reports,sessions}` (audit logs live in the DynamoDB `vshift-audit` table) |
| `SES_SOURCE_EMAIL` | verified SES identity |
| `SNS_TOPIC_ARN` | vshift-sms topic ARN |
| `AUTOMATION_ENABLED` | `true` |
| `NOSHOW_THRESHOLD_MINUTES` | `15` |

Prefer AWS Secrets Manager for the SES/SNS values; never hardcode credentials.

## Step 5: Verify

```bash
curl -s https://<deployment-endpoint>/ping          # Healthy
curl -s -X POST https://<deployment-endpoint>/invocations \
  -H 'Content-Type: application/json' \
  -d '{"prompt":"Summarize shift s001 state."}' | python3 -m json.tool
```

## Step 6: IAM

Attach `infra/iam/vshift-role-policy.json` to the runtime role (least privilege).
Run `infra/scripts/bootstrap.sh` to create S3 buckets, SNS topic, and EventBridge rules.

## Notes

- The AgentCore entry (`agentcore_entry.py`) binds port **8080** (not 8000) — map
  your load balancer / target group accordingly.
- Smoke-test the image in `mock` mode before pointing at the live model to keep
  Bedrock spend low.