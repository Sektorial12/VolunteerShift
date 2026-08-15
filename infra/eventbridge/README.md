# Vshift EventBridge rules
#
# These rules drive the automation scheduler in production. They fire the
# appropriate action by invoking the API at a scheduled time. Because shifts
# have varying start/end times, per-shift timing (reminders at -48h/-2h,
# no-show at start+threshold, track at end) is handled IN-PROCESS by the
# automation worker (see src/vshift/automation.py); these rules handle the
# fixed cadence triggers.

# Weekly report every Monday at 09:00 UTC
#   Schedule expression: cron(0 9 ? * MON *)
#   Target: POST {API_BASE}/api/trigger  body={"action":"report"}

# Periodic sweep to catch late-scheduling of shifts
# (safe fallback for any in-process scheduler miss; runs every 5 min)
#   Schedule expression: rate(5 minutes)
#   Target: POST {API_BASE}/api/automation/run

# Example via AWS CLI:
#
#   aws events put-rule \
#     --name vshift-report-weekly \
#     --schedule-expression "cron(0 9 ? * MON *)"
#
#   aws events put-rule \
#     --name vshift-automation-sweep \
#     --schedule-expression "rate(5 minutes)"
#
#   # Then attach HTTP targets pointing at the deployed API's corresponding
#   # endpoints (/api/trigger for report, /api/automation/run for sweep).
#   # The target RoleArn must allow events:InvokeApiDestination.