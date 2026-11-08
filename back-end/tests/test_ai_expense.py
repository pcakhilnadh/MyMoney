import base64
import json

import requests
from sqlalchemy import select

from app.ai.provider import NvidiaProvider
from app.config import settings
from app.models import AICallLog
from tests.conftest import H


IMAGE = base64.b64encode(b"\x89PNG\r\n\x1a\nexample").decode()
BODY = {"images": [{"mime_type": "image/png", "data": IMAGE}], "categories": ["Food", "Travel"]}


def provider_response(content, status=200):
    response = requests.Response()
    response.status_code = status
    response._content = json.dumps({
        "choices": [{"message": {"content": json.dumps(content)}}],
        "usage": {"prompt_tokens": 23, "completion_tokens": 12, "total_tokens": 35},
    }).encode()
    return response


def test_expense_analysis_logs_full_request_response_and_usage(client, monkeypatch):
    monkeypatch.setattr(settings, "nvidia_api_key", "test-key")
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
        assert IMAGE in json.dumps(log.request_payload)
        assert "test-key" not in json.dumps(log.request_payload)
        assert log.response_payload["usage"]["total_tokens"] == 35
        assert (log.input_tokens, log.output_tokens, log.total_tokens) == (23, 12, 35)
        assert log.completed_at is not None


def test_non_bill_and_unknown_category(client, monkeypatch):
    monkeypatch.setattr(settings, "nvidia_api_key", "test-key")
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
    monkeypatch.setattr(settings, "nvidia_api_key", "test-key")

    def fail(self, payload):
        raise requests.Timeout("private connection details")

    monkeypatch.setattr(NvidiaProvider, "send", fail)
    assert client.post("/money/ai/expense", json=BODY).status_code == 401
    invalid = {**BODY, "images": [{"mime_type": "image/png", "data": "aGVsbG8="}]}
    assert client.post("/money/ai/expense", json=invalid, headers=H("alice")).status_code == 422
    result = client.post("/money/ai/expense", json=BODY, headers=H("alice"))
    assert result.status_code == 502
    with client.session_factory() as db:
        logs = db.scalars(select(AICallLog)).all()
        assert len(logs) == 1
        assert logs[0].status == "failed"
        assert logs[0].error == "Provider request failed"
        assert logs[0].completed_at is not None


def test_provider_error_and_bad_json_are_logged(client, monkeypatch):
    monkeypatch.setattr(settings, "nvidia_api_key", "test-key")
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
        assert logs[1].error == "Invalid provider response"
