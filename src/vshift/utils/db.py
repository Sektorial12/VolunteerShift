import logging
from decimal import Decimal
from typing import Any

import boto3
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from vshift.config import config

logger = logging.getLogger(__name__)


def _from_dynamodb(value: Any) -> Any:
    """Convert DynamoDB Decimals back to plain JSON types on read.

    Whole numbers become int, fractional become float. Recurses into
    dicts and lists so API responses never leak Decimal (which FastAPI
    would serialize as a string, breaking numeric consumers).
    """
    if isinstance(value, Decimal):
        return int(value) if value == int(value) else float(value)
    if isinstance(value, dict):
        return {k: _from_dynamodb(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_from_dynamodb(v) for v in value]
    return value


class DynamoDBClient:
    def __init__(self, region: str | None = None):
        self._region = region or config.aws_region
        self._dynamodb = boto3.resource("dynamodb", region_name=self._region)
        self._client = boto3.client("dynamodb", region_name=self._region)

    def get_table(self, table_name: str):
        return self._dynamodb.Table(table_name)

    def put_item(self, table_name: str, item: dict[str, Any]) -> None:
        table = self.get_table(table_name)
        table.put_item(Item=item)

    def get_item(self, table_name: str, key: dict[str, Any]) -> dict[str, Any] | None:
        table = self.get_table(table_name)
        try:
            response = table.get_item(Key=key)
            item = response.get("Item")
            return _from_dynamodb(item) if item is not None else None
        except ClientError as e:
            logger.error("Error getting item from %s: %s", table_name, e)
            return None

    def query(
        self, table_name: str, key_condition: Key, index_name: str | None = None
    ) -> list[dict[str, Any]]:
        table = self.get_table(table_name)
        kwargs: dict[str, Any] = {"KeyConditionExpression": key_condition}
        if index_name:
            kwargs["IndexName"] = index_name
        response = table.query(**kwargs)
        return _from_dynamodb(response.get("Items", []))

    def scan(self, table_name: str) -> list[dict[str, Any]]:
        table = self.get_table(table_name)
        response = table.scan()
        return _from_dynamodb(response.get("Items", []))

    def update_item(
        self,
        table_name: str,
        key: dict[str, Any],
        update_expression: str,
        expression_values: dict[str, Any],
        expression_names: dict[str, str] | None = None,
    ) -> dict[str, Any] | None:
        table = self.get_table(table_name)
        kwargs: dict[str, Any] = {
            "Key": key,
            "UpdateExpression": update_expression,
            "ExpressionAttributeValues": expression_values,
            "ReturnValues": "ALL_NEW",
        }
        if expression_names:
            kwargs["ExpressionAttributeNames"] = expression_names
        try:
            response = table.update_item(**kwargs)
            attrs = response.get("Attributes")
            return _from_dynamodb(attrs) if attrs is not None else None
        except ClientError as e:
            logger.error("Error updating item in %s: %s", table_name, e)
            return None

    def delete_item(self, table_name: str, key: dict[str, Any]) -> None:
        table = self.get_table(table_name)
        table.delete_item(Key=key)

    def create_table_if_not_exists(
        self,
        table_name: str,
        key_schema: list[dict[str, str]],
        attribute_definitions: list[dict[str, str]],
        gsi: list[dict[str, Any]] | None = None,
    ) -> None:
        existing = self._client.list_tables().get("TableNames", [])
        if table_name in existing:
            logger.info("Table %s already exists", table_name)
            return

        kwargs: dict[str, Any] = {
            "TableName": table_name,
            "KeySchema": key_schema,
            "AttributeDefinitions": attribute_definitions,
            "BillingMode": "PAY_PER_REQUEST",
        }
        if gsi:
            kwargs["GlobalSecondaryIndexes"] = gsi

        self._dynamodb.create_table(**kwargs)
        logger.info("Created table %s", table_name)


db = DynamoDBClient()
