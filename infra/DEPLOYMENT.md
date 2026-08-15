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

For the AgentCore/CDK deploy itself, create + attach the managed policy
`infra/iam/agentcore-deploy-policy.json` (CloudFormation, ECR, ECS, Lambda,
CodeBuild, KMS, SSM, S3, service-quotas). Note:

- This policy exceeds the 2048-byte **inline** policy cap, so it must be a
  **managed policy** (`aws iam create-policy` + `attach-user-policy`).
- After updating the policy JSON, run `aws iam create-policy-version` and
  **`aws iam set-default-policy-version`** — otherwise CDK sees the stale version.

## Step 7: AgentCore account quotas (required before first deploy)

AgentCore/CDK deployment on a brand-new AWS account commonly fails at two
account-level **service quotas** (not IAM):

1. **AWS CodeBuild — "Concurrently running builds for Linux Lambda/2GB" = 0**
   → use `--build CodeZip` for the agent to avoid CodeBuild entirely (verified working),
   or submit a Service Quotas increase.
2. **Amazon Bedrock AgentCore — "Total Agents per Account" = 0** and
   "Endpoints per Agent" / "Versions per Agent" = 0.
   → Request an increase: `aws service-quotas request-service-quota-increase \
     --service-code bedrock-agentcore --quota-code L-F4575653 --desired-value 1001`
   (auto-approves; verify with `aws service-quotas get-service-quota ...`).

Do not attempt CodeZip/CodeBuild or the AgentCore deploy until quota #2 shows a
non-zero value, or the CFN stack fails with
"maxAgents limit exceeded for account".

## Notes

- The AgentCore entry (`agentcore_entry.py`) binds port **8080** (not 8000) — map
  your load balancer / target group accordingly.
- Smoke-test the image in `mock` mode before pointing at the live model to keep
  Bedrock spend low.