import os
from dataclasses import dataclass
from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Config:
    aws_region: str = os.getenv("AWS_REGION", "us-east-1")
    bedrock_model_id: str = os.getenv(
        "BEDROCK_MODEL_ID", "mistral.mistral-large-3-675b-instruct"
    )
    bedrock_bearer_token: str = os.getenv("AWS_BEARER_TOKEN_BEDROCK", "")

    ddb_volunteers_table: str = os.getenv("DDB_VOLUNTEERS_TABLE", "vshift-volunteers")
    ddb_shifts_table: str = os.getenv("DDB_SHIFTS_TABLE", "vshift-shifts")
    ddb_communications_table: str = os.getenv(
        "DDB_COMMUNICATIONS_TABLE", "vshift-communications"
    )
    ddb_reports_table: str = os.getenv("DDB_REPORTS_TABLE", "vshift-reports")
    ddb_audit_table: str = os.getenv("DDB_AUDIT_TABLE", "vshift-audit")

    s3_reports_bucket: str = os.getenv("S3_REPORTS_BUCKET", "vshift-reports")
    s3_audit_bucket: str = os.getenv("S3_AUDIT_BUCKET", "vshift-audit")
    s3_sessions_bucket: str = os.getenv("S3_SESSIONS_BUCKET", "vshift-sessions")

    ses_source_email: str = os.getenv("SES_SOURCE_EMAIL", "coordinator@vshift.example.org")
    sns_topic_arn: str = os.getenv("SNS_TOPIC_ARN", "")

    app_host: str = os.getenv("APP_HOST", "0.0.0.0")
    app_port: int = int(os.getenv("APP_PORT", "8000"))
    app_debug: bool = os.getenv("APP_DEBUG", "true").lower() == "true"

    noshow_threshold_minutes: int = int(os.getenv("NOSHOW_THRESHOLD_MINUTES", "2"))


config = Config()
