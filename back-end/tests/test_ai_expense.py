import base64
import io
import json
import random
import socket
from datetime import datetime, timedelta, timezone

import requests
from PIL import Image as PILImage
from sqlalchemy import select

from app.ai import expense
from app.ai.expense import Image as ExpenseImage
from app.ai.provider import NvidiaProvider
from app.config import settings
from app.models import AICallLog
from tests.conftest import H
from fastapi import HTTPException


image_buffer = io.BytesIO()
PILImage.new("RGB", (16, 16), "white").save(image_buffer, format="PNG")
IMAGE = base64.b64encode(image_buffer.getvalue()).decode()
BODY = {"images": [{"mime_type": "image/png", "data": IMAGE}], "categories": ["Food", "Travel"]}


def test_provider_uses_180_second_read_timeout(monkeypatch):
    seen = {}

    def post(url, **kwargs):
        seen.update(kwargs)
        return requests.Response()

    monkeypatch.setattr(requests, "post", post)
    NvidiaProvider("https://example.com", "test-key").send({"model": "test"})
    assert seen["timeout"] == (10, 180)


def provider_response(content, status=200):
    response = requests.Response()
    response.status_code = status
    response._content = json.dumps({
        "choices": [{"message": {"content": json.dumps(content)}}],
        "usage": {"prompt_tokens": 23, "completion_tokens": 12, "total_tokens": 35},
    }).encode()
    return response


def test_expense_analysis_logs_full_request_response_and_usage(client, monkeypatch):
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    seen = []

    def send(self, payload):
        seen.append(payload)
        return provider_response({
            "is_bill": True, "title": "Lunch", "total_amount": "123.45",
            "bill_date": "2026-11-08", "merchant_name": "Cafe", "summary": "Lunch",
            "category": "Food", "items": [{"name": "Meal", "quantity": 1, "amount": "123.45"}],
        })

    monkeypatch.setattr(NvidiaProvider, "send", send)
    body = {**BODY, "images": BODY["images"] * 2}
    result = client.post("/api/money/ai/expense", json=body, headers=H("alice"))
    assert result.status_code == 200
    assert result.json()["total_amount"] == "123.45"
    assert result.json()["category"] == "Food"
    assert len(result.json()["items"]) == 1
    assert len(seen[0]["messages"][0]["content"]) == 3
    assert "Food" in seen[0]["messages"][0]["content"][0]["text"]
    with client.session_factory() as db:
        log = db.scalar(select(AICallLog))
        assert log.status == "success"
        assert log.request_payload == seen[0]
        image_data = seen[0]["messages"][0]["content"][1]["image_url"]["url"]
        assert image_data.startswith("data:image/jpeg;base64,")
        assert base64.b64decode(image_data.split(",", 1)[1]).startswith(b"\xff\xd8\xff")
        assert "test-key" not in json.dumps(log.request_payload)
        assert log.response_payload["usage"]["total_tokens"] == 35
        assert (log.input_tokens, log.output_tokens, log.total_tokens) == (23, 12, 35)
        assert log.completed_at is not None
        assert log.elapsed_ms is not None
        assert log.elapsed_ms >= 0


def test_large_image_is_compressed_before_calling_provider(client, monkeypatch):
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    source = PILImage.frombytes("RGB", (1200, 1200), random.Random(1).randbytes(1200 * 1200 * 3))
    image_buffer = io.BytesIO()
    source.save(image_buffer, format="PNG")
    original = image_buffer.getvalue()
    assert 3 * 1024 * 1024 < len(original) < settings.max_image_upload_mb * 1024 * 1024
    seen = []
    monkeypatch.setattr(NvidiaProvider, "send", lambda self, payload: seen.append(payload) or provider_response({"is_bill": False}))
    body = {
        **BODY,
        "images": [{"mime_type": "image/png", "data": base64.b64encode(original).decode()}],
    }

    result = client.post("/money/ai/expense", json=body, headers=H("alice"))

    assert result.status_code == 200
    compressed = seen[0]["messages"][0]["content"][1]["image_url"]["url"]
    assert compressed.startswith("data:image/jpeg;base64,")
    assert len(base64.b64decode(compressed.split(",", 1)[1])) < len(original)


def test_images_over_configured_limit_are_rejected():
    padded_image = base64.b64encode(image_buffer.getvalue() + b"\x00" * (3 * 1024 * 1024)).decode()
    images = [
        ExpenseImage(mime_type="image/png", data=padded_image),
        ExpenseImage(mime_type="image/png", data=padded_image),
    ]

    try:
        expense._validate_images(images)
    except HTTPException as error:
        assert error.status_code == 413
    else:
        raise AssertionError("Images over the configured limit should be rejected")


def test_elapsed_time_is_null_while_pending_and_recorded_on_completion(client, monkeypatch):
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    started = datetime(2026, 11, 8, 10, 6, 29, 317830, tzinfo=timezone.utc)
    finished = started + timedelta(seconds=175, microseconds=62515)

    class FixedClock:
        times = iter((started, finished))

        @classmethod
        def now(cls, tz):
            return next(cls.times)

    monkeypatch.setattr(expense, "datetime", FixedClock)

    def send(self, payload):
        with client.session_factory() as db:
            log = db.scalar(select(AICallLog))
            assert log.status == "pending"
            assert log.completed_at is None
            assert log.elapsed_ms is None
        return provider_response({"is_bill": False})

    monkeypatch.setattr(NvidiaProvider, "send", send)
    assert client.post("/money/ai/expense", json=BODY, headers=H("alice")).status_code == 200
    with client.session_factory() as db:
        log = db.scalar(select(AICallLog))
        assert log.elapsed_ms == 175063
        assert log.completed_at is not None


def test_non_bill_and_unknown_category(client, monkeypatch):
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    monkeypatch.setattr(NvidiaProvider, "send", lambda self, payload: provider_response(
        {"is_bill": False, "total_amount": "not a number"}
    ))
    result = client.post("/money/ai/expense", json=BODY, headers=H("alice"))
    assert result.status_code == 200
    assert result.json()["is_bill"] is False
    monkeypatch.setattr(NvidiaProvider, "send", lambda self, payload: provider_response(
        {"is_bill": True, "category": "Unlisted"}
    ))
    result = client.post("/money/ai/expense", json=BODY, headers=H("alice"))
    assert result.json()["category"] is None


def test_failure_is_audited_and_invalid_input_does_not_call_provider(client, monkeypatch):
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")

    def fail(self, payload):
        raise requests.Timeout("private connection details")

    monkeypatch.setattr(NvidiaProvider, "send", fail)
    assert client.post("/money/ai/expense", json=BODY).status_code == 401
    invalid = {**BODY, "images": [{"mime_type": "image/png", "data": "aGVsbG8="}]}
    assert client.post("/money/ai/expense", json=invalid, headers=H("alice")).status_code == 422
    result = client.post("/money/ai/expense", json=BODY, headers=H("alice"))
    assert result.status_code == 504
    assert result.json()["detail"] == "AI provider timed out. Please try again later."
    with client.session_factory() as db:
        logs = db.scalars(select(AICallLog)).all()
        assert len(logs) == 1
        assert logs[0].status == "failed"
        details = json.loads(logs[0].error)
        assert details["exception"] == "Timeout"
        assert details["endpoint_host"] == "api.deepseek.com"
        assert details["connect_timeout_seconds"] == 10
        assert details["read_timeout_seconds"] == 180
        assert "private connection details" not in logs[0].error
        assert logs[0].completed_at is not None
        assert logs[0].elapsed_ms is not None
        assert logs[0].elapsed_ms >= 0


def test_connection_error_is_distinct_from_non_bill(client, monkeypatch):
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")

    def fail(self, payload):
        raise requests.ConnectionError(socket.gaierror(-2, "private connection details"))

    monkeypatch.setattr(NvidiaProvider, "send", fail)
    result = client.post("/money/ai/expense", json=BODY, headers=H("alice"))
    assert result.status_code == 502
    assert result.json()["detail"] == "Could not connect to the AI provider. Please try again later."
    with client.session_factory() as db:
        log = db.scalar(select(AICallLog))
        details = json.loads(log.error)
        assert details["exception"] == "ConnectionError"
        assert details["exception_chain"][1]["kind"] == "dns_resolution"
        assert details["exception_chain"][1]["errno"] == -2
        assert "private connection details" not in log.error


def test_provider_error_and_bad_json_are_logged(client, monkeypatch):
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    monkeypatch.setattr(NvidiaProvider, "send", lambda self, payload: provider_response(
        {"error": "test-key"}, 429
    ))
    assert client.post("/money/ai/expense", json=BODY, headers=H("alice")).status_code == 502
    monkeypatch.setattr(NvidiaProvider, "send", lambda self, payload: provider_response("not json"))
    assert client.post("/money/ai/expense", json=BODY, headers=H("alice")).status_code == 502
    with client.session_factory() as db:
        logs = db.scalars(select(AICallLog)).all()
        assert [log.status for log in logs] == ["failed", "failed"]
        assert logs[0].http_status == 429
        assert logs[0].total_tokens == 35
        assert "test-key" not in json.dumps(logs[0].response_payload)
        details = json.loads(logs[1].error)
        assert details["reason"] == "schema_validation"
        assert details["validation_errors"][0]["type"] == "model_type"


def test_invalid_response_diagnostics_exclude_sensitive_input(client, monkeypatch):
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    monkeypatch.setattr(NvidiaProvider, "send", lambda self, payload: provider_response({
        "is_bill": True, "total_amount": "private receipt data",
    }))
    result = client.post("/money/ai/expense", json=BODY, headers=H("alice"))
    assert result.status_code == 502
    with client.session_factory() as db:
        log = db.scalar(select(AICallLog))
        details = json.loads(log.error)
        assert details["validation_errors"][0]["field"] == "total_amount"
        assert details["validation_errors"][0]["type"] == "decimal_parsing"
        assert "private receipt data" not in log.error
