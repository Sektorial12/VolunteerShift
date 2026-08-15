#!/usr/bin/env bash
#
# Creates the CloudWatch dashboard + alarms for Vshift.
# Run after bootstrap.sh (needs metric data flowing to be meaningful).
#
set -euo pipefail

REGION="${AWS_REGION:-us-east-1}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
NAMESPACE="Vshift"

echo "==> Creating Vshift dashboard"
aws cloudwatch put-dashboard \
  --dashboard-name Vshift \
  --dashboard-body "$(cat "$SCRIPT_DIR/../cloudwatch/vshift-dashboard.json")" \
  --region "$REGION" >/dev/null
echo "    dashboard: Vshift"

echo "==> Creating alarms"

# No-show detection spike
aws cloudwatch put-metric-alarm \
  --alarm-name vshift-no-shows-detected \
  --alarm-description "Alert when multiple no-shows detected in an hour" \
  --metric-name no_shows_detected \
  --namespace "$NAMESPACE" \
  --statistic Sum \
  --period 3600 \
  --evaluation-periods 1 \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold \
  --region "$REGION" >/dev/null
echo "    alarm: vshift-no-shows-detected"

# Communications dropping to zero (possible send failure)
aws cloudwatch put-metric-alarm \
  --alarm-name vshift-no-communications \
  --alarm-description "Alert when no communications sent over 3 hours" \
  --metric-name communications_sent \
  --namespace "$NAMESPACE" \
  --statistic Sum \
  --period 3600 \
  --evaluation-periods 3 \
  --threshold 0 \
  --comparison-operator LessThanOrEqualToThreshold \
  --treat-missing-data notBreaching \
  --region "$REGION" >/dev/null
echo "    alarm: vshift-no-communications"

echo "==> Done. View at https://$REGION.console.aws.amazon.com/cloudwatch/home?region=$REGION#dashboards:name=Vshift"