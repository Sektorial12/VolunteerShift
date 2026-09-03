#!/usr/bin/env bash
#
# Deploys the SES-inbound Lambda and subscribes it to the
# vshift-inbound-mail SNS topic.
#
# Usage:
#   VSHIFT_API_BASE=https://api.example.com ./deploy-ses-inbound.sh
#
# Prerequisites:
#   - vshift-inbound-mail SNS topic exists (see infra/scripts/bootstrap.sh)
#   - VSHIFT_API_BASE points at a reachable FastAPI server
#   - optionally VSHIFT_API_KEY for the X-API-Key gate
#
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
API_BASE="${VSHIFT_API_BASE:?set VSHIFT_API_BASE to the FastAPI base URL}"
ROLE_NAME="${LAMBDA_ROLE_NAME:-vshift-ses-inbound-role}"
FN_NAME="${LAMBDA_FN_NAME:-vshift-ses-inbound}"
TOPIC_ARN="arn:aws:sns:${REGION}:$(aws sts get-caller-identity --query Account --output text):vshift-inbound-mail"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==> Packaging Lambda"
rm -rf /tmp/ses-inbound-pkg && mkdir -p /tmp/ses-inbound-pkg
cp "$SCRIPT_DIR/ses_inbound.py" /tmp/ses-inbound-pkg/
cd /tmp/ses-inbound-pkg && zip -q ses_inbound.zip ses_inbound.py

echo "==> Ensuring execution role ($ROLE_NAME)"
if ! aws iam get-role --role-name "$ROLE_NAME" 2>/dev/null; then
  aws iam create-role --role-name "$ROLE_NAME" \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  aws iam attach-role-policy --role-name "$ROLE_NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  echo "    waiting for role propagation..."
  sleep 10
fi
ROLE_ARN=$(aws iam get-role --role-name "$ROLE_NAME" --query 'Role.Arn' --output text)

echo "==> Creating/updating function ($FN_NAME)"
if aws lambda get-function --function-name "$FN_NAME" --region "$REGION" 2>/dev/null; then
  aws lambda update-function-code --function-name "$FN_NAME" --zip-file fileb:///tmp/ses-inbound-pkg/ses_inbound.zip --region "$REGION" >/dev/null
else
  aws lambda create-function --function-name "$FN_NAME" \
    --runtime python3.12 --handler ses_inbound.handler \
    --role "$ROLE_ARN" --zip-file fileb:///tmp/ses-inbound-pkg/ses_inbound.zip \
    --timeout 30 --memory-size 256 --region "$REGION" >/dev/null
fi

echo "==> Setting env vars"
aws lambda update-function-configuration --function-name "$FN_NAME" --region "$REGION" \
  --environment "Variables={VSHIFT_API_BASE=$API_BASE,VSHIFT_API_KEY=${VSHIFT_API_KEY:-}}" >/dev/null

echo "==> Subscribing Lambda to SNS topic"
FN_ARN=$(aws lambda get-function --function-name "$FN_NAME" --region "$REGION" --query 'Configuration.FunctionArn' --output text)
aws lambda add-permission --function-name "$FN_NAME" --statement-id sns-invoke \
  --action lambda:InvokeFunction --principal sns.amazonaws.com \
  --source-arn "$TOPIC_ARN" --region "$REGION" 2>/dev/null || true
aws sns subscribe --topic-arn "$TOPIC_ARN" --protocol lambda \
  --notification-endpoint "$FN_ARN" --region "$REGION" >/dev/null || true

echo "==> Done. Test with: aws sns publish --topic-arn $TOPIC_ARN --message '{\"test\":1}'"