from __future__ import annotations

import logging
import time

from vshift.config import config

logger = logging.getLogger(__name__)

_BEDROCK_RETRYABLE_ERRORS = (
    "ThrottlingException",
    "ModelStreamErrorException",
    "ServiceUnavailableException",
    "ReadTimeoutError",
    "ConnectionError",
)


def create_model():
    """Create the LLM model for agents.

    Uses Bedrock Mantle (OpenAI-compatible) API with bearer token when available,
    falls back to standard Bedrock model otherwise.

    Retries on transient Bedrock errors (throttling, timeout, service unavailable).
    """
    for attempt in range(3):
        try:
            return _create_model_inner()
        except Exception as e:
            error_code = getattr(e, "response", {}).get("Error", {}).get("Code", "") if hasattr(e, "response") else str(e)
            if any(err in str(error_code) for err in _BEDROCK_RETRYABLE_ERRORS) and attempt < 2:
                wait = 2 ** attempt
                logger.warning("Bedrock model creation retry %d/3 after %ss: %s", attempt + 1, wait, error_code)
                time.sleep(wait)
                continue
            raise
    return None


def _create_model_inner():
    if config.bedrock_bearer_token:
        from strands.models import OpenAIModel
        from strands.models._openai_bedrock import BedrockMantleConfig

        mantle_config = BedrockMantleConfig(region=config.aws_region)
        model = OpenAIModel(
            model_id=config.bedrock_model_id,
            bedrock_mantle_config=mantle_config,
        )
        logger.info("Using Bedrock Mantle model: %s", config.bedrock_model_id)
        return model
    else:
        from strands.models import BedrockModel

        model = BedrockModel(
            model_id=config.bedrock_model_id,
            region_name=config.aws_region,
        )
        logger.info("Using Bedrock model: %s", config.bedrock_model_id)
        return model
