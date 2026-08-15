#!/usr/bin/env bash
#
# Vshift AWS infrastructure bootstrap.
#
# Creates the S3 buckets and EventBridge scheduler rules used in production.
# DynamoDB tables are created by the seed script at app startup.
#
# Prerequisites:
#   - AWS CLI configured with credentials for the target account
#   - The agent/API must be reachable at the URL below after deployment
#
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
API_BASE="${API_BASE:-https://api.vshift.example.org}"

s3_buckets=("vshift-reports" "vshift-audit" "vshift-sessions")

echo "==> Ensuring S3 buckets exist"
for bucket in "${s3_buckets[@]}"; do
  if aws s3api head-bucket --bucket "$bucket" --region "$REGION" 2>/dev/null; then
    echo "  ${bucket}: exists"
  else
    echo "  ${bucket}: creating..."
    aws s3api create-bucket --bucket "$bucket" --region "$REGION" >/dev/null
  fi
done

echo "==> Ensuring vshift-sms SNS topic exists"
TOPIC_ARN=$(aws sns create-topic --name vshift-sms --region "$REGION" --query 'TopicArn' --output text)
echo "    SNS topic: $TOPIC_ARN"

echo "==> Verifying SES identity is verified"
ses_status=$(aws ses get-identity-verification-attributes --identities "$SES_SOURCE_EMAIL" --region "$REGION" \
  --query "VerificationAttributes.\"$SES_SOURCE_EMAIL\".VerificationStatus" --output text 2>/dev/null || echo "NotVerified")
echo "    SES $SES_SOURCE_EMAIL: $ses_status"

echo "==> EventBridge rules (HTTP targets to the API Base URL)"
api_target() {
  local rule="$1" cron="$2"
  cat > /tmp/vshift-eb-target.json <<EOF
  {
    "rule": "${rule}",
    "targets": [
      {
        "Arn": "arn:aws:events:${REGION}:$(aws sts get-caller-identity --query Account --output text):api-destination",
        "Id": "vshift-api-target",
        "RoleArn": "..."
      }
    ]
  }
EOF
}

aws events put-rule --name vshift-report-weekly --schedule-expression "cron(0 9 ? * MON *)" --region "$REGION" >/dev/null
echo "    rule: vshift-report-weekly (Monday 09:00 UTC)"

echo ""
echo "==> Summary =="
echo "  API_BASE_URL=$API_BASE"
echo "  SNS_TOPIC_ARN=$TOPIC_ARN"
echo "  Buckets: ${s3_buckets[*]}"
echo ""
echo "Next steps:"
echo "  1. Create IAM role with infra/iam/vshift-role-policy.json attached"
echo "  2. Deploy the container (ECR + AgentCore) with env vars from .env.example"
echo "  3. Set API_BASE_URL to the deployed endpoint and wire EventBridge HTTP targets"