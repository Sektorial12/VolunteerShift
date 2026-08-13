"""CloudWatch custom metrics for Vshift observability.

Emits custom metrics to CloudWatch for agent activity tracking:
- vshift.shifts_coordinated
- vshift.no_shows_detected
- vshift.no_shows_recovered
- vshift.hours_logged
- vshift.communications_sent
"""

from __future__ import annotations

import logging
from typing import Any

import boto3
from botocore.exceptions import ClientError

from vshift.config import config

logger = logging.getLogger(__name__)

_NAMESPACE = "Vshift"

_cloudwatch: Any = None


def _get_client():
    global _cloudwatch
    if _cloudwatch is None:
        _cloudwatch = boto3.client("cloudwatch", region_name=config.aws_region)
    return _cloudwatch


def _emit(metric_name: str, value: float = 1.0, unit: str = "Count", dimensions: list[dict] | None = None) -> None:
    metric_data: dict[str, Any] = {
        "MetricName": metric_name,
        "Value": value,
        "Unit": unit,
    }
    if dimensions:
        metric_data["Dimensions"] = dimensions

    try:
        _get_client().put_metric_data(Namespace=_NAMESPACE, MetricData=[metric_data])
        logger.debug("Emitted metric: %s = %s", metric_name, value)
    except ClientError as e:
        logger.warning("Failed to emit metric %s: %s", metric_name, e)


def shifts_coordinated(shift_id: str = "") -> None:
    _emit("shifts_coordinated", dimensions=[{"Name": "ShiftId", "Value": shift_id}] if shift_id else None)


def no_shows_detected(shift_id: str = "", count: int = 1) -> None:
    _emit("no_shows_detected", value=float(count), dimensions=[{"Name": "ShiftId", "Value": shift_id}] if shift_id else None)


def no_shows_recovered(shift_id: str = "", count: int = 1) -> None:
    _emit("no_shows_recovered", value=float(count), dimensions=[{"Name": "ShiftId", "Value": shift_id}] if shift_id else None)


def hours_logged(volunteer_id: str = "", hours: float = 0.0) -> None:
    _emit("hours_logged", value=hours, unit="None", dimensions=[{"Name": "VolunteerId", "Value": volunteer_id}] if volunteer_id else None)


def communications_sent(channel: str = "email", count: int = 1) -> None:
    _emit("communications_sent", value=float(count), dimensions=[{"Name": "Channel", "Value": channel}])
