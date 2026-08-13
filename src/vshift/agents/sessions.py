from __future__ import annotations

import logging

from vshift.config import config

logger = logging.getLogger(__name__)


def create_session_manager(session_id: str):
    """Create an S3-backed session manager for agent state persistence.

    Args:
        session_id: Unique identifier for this session (e.g., shift_id or coordinator_id).

    Returns:
        S3SessionManager instance.
    """
    from strands.session.s3_session_manager import S3SessionManager

    return S3SessionManager(
        session_id=session_id,
        bucket=config.s3_sessions_bucket,
        prefix="vshift-sessions/",
    )


def create_file_session_manager(session_id: str):
    """Create a file-backed session manager for local development.

    Args:
        session_id: Unique identifier for this session.

    Returns:
        FileSessionManager instance.
    """
    from strands.session.file_session_manager import FileSessionManager

    return FileSessionManager(session_id=session_id)
