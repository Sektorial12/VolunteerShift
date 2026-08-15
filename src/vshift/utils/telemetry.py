"""OpenTelemetry / Strands telemetry setup for Vshift.

Sets up StrandsTelemetry with OTLP export when enabled. In production the OTLP
endpoint is typically the AWS ADOT / CloudWatch OTLP collector, which forwards
traces and metrics to CloudWatch.
"""

from __future__ import annotations

import logging

from vshift.config import config

logger = logging.getLogger(__name__)

_started = False


def setup_telemetry() -> None:
    """Initialize Strands Telemetry once per process.

    Only active when TELEMETRY_ENABLED=true. Falls back to console export when
    no OTLP endpoint is configured, so local debugging shows spans without AWS.
    """
    global _started
    if _started or not config.telemetry_enabled:
        return
    _started = True

    from strands.telemetry import StrandsTelemetry

    try:
        telemetry = StrandsTelemetry()
        if config.otlp_endpoint:
            telemetry.setup_otlp_exporter(endpoint=config.otlp_endpoint)
            tel_type = f"OTLP ({config.otlp_endpoint})"
        else:
            telemetry.setup_console_exporter()
            tel_type = "console"
        telemetry.setup_meter(enable_otlp_exporter=bool(config.otlp_endpoint))
        logger.info("StrandsTelemetry enabled (exporter=%s)", tel_type)
    except Exception as e:  # noqa: BLE001
        logger.warning("Failed to enable telemetry: %s", e)