from __future__ import annotations

import logging

from vshift.config import config

logger = logging.getLogger(__name__)


def create_model():
    """Create the LLM model for agents.

    Uses Bedrock Mantle (OpenAI-compatible) API with bearer token when available,
    falls back to standard Bedrock model otherwise.
    """
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
