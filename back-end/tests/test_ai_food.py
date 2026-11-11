import base64
import io
import json

import pytest
import requests
from PIL import Image as PILImage
from sqlalchemy import select

from app.ai.food import parse_food_table
from app.ai.provider import NvidiaProvider
from app.config import settings
from app.models import AICallLog
from tests.conftest import H
from tests.test_food_catalog import create_writable_catalog


buffer = io.BytesIO()
PILImage.new("RGB", (16, 16), "white").save(buffer, format="PNG")
image = {"mime_type": "image/png", "data": base64.b64encode(buffer.getvalue()).decode()}
table = (
    "items[2]{name,canonical_name,qty,unit,kcal,food_type,food_category}:\n"
    "  Rice puttu,rice puttu,100,g,130,processed,grain\n"
    "  Sambar,sambar,150,ml,90,processed,legume"
)


def response(content):
    result = requests.Response()
    result.status_code = 200
    result._content = json.dumps({
        "choices": [{"message": {"content": content}}],
        "usage": {"total_tokens": 25},
    }).encode()
    return result


def test_food_analysis_uses_configured_provider_and_audits(client, monkeypatch):
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    monkeypatch.setattr(settings, "expense_ai_provider", "deepseek")
    seen = []
    monkeypatch.setattr(NvidiaProvider, "send", lambda self, payload: seen.append(payload) or response(table))
    assert client.post("/api/food/ai/food-analyse", json={"images": [image]}).status_code == 401
    result = client.post("/api/food/ai/food-analyse", json={"images": [image]}, headers=H("alice"))
    assert result.status_code == 200
    assert result.json()["items"][0] == {
        "name": "Rice puttu", "canonical_name": "rice puttu", "qty": 100,
        "unit": "g", "kcal": 130, "food_type": "processed", "food_category": "grain",
    }
    assert seen[0]["model"] == settings.expense_ai_model
    assert seen[0]["thinking"] == {"type": "disabled"}
    assert "Indian-first calorie tracker" in seen[0]["messages"][0]["content"][0]["text"]
    assert seen[0]["messages"][0]["content"][1]["image_url"]["url"].startswith("data:image/jpeg;base64,")
    with client.session_factory() as db:
        log = db.scalar(select(AICallLog))
        assert log.task == "food_analysis"
        assert log.status == "success"
        assert log.total_tokens == 25


@pytest.mark.parametrize("content", [
    "items[1]:\n  Egg,egg,1,Nos,70,raw,egg",
    "items[2]{name,canonical_name,qty,unit,kcal,food_type,food_category}:\n  Egg,egg,1,Nos,70,raw,egg",
    "items[1]{name,canonical_name,qty,unit,kcal,food_type,food_category}:\n  Egg,egg,1,cup,70,raw,egg",
    "items[1]{name,canonical_name,qty,unit,kcal,food_type,food_category}:\n  Egg,egg,NaN,Nos,70,raw,egg",
    "```items[0]:```",
])
def test_invalid_food_response_is_rejected_and_logged(client, monkeypatch, content):
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    monkeypatch.setattr(settings, "expense_ai_provider", "deepseek")
    monkeypatch.setattr(NvidiaProvider, "send", lambda self, payload: response(content))
    result = client.post("/api/food/ai/food-analyse", json={"images": [image]}, headers=H("alice"))
    assert result.status_code == 502
    with client.session_factory() as db:
        assert db.scalar(select(AICallLog)).status == "failed"


def test_empty_food_table_and_invalid_image(client, monkeypatch):
    assert parse_food_table("items[0]:").items == []
    monkeypatch.setattr(settings, "deepseek_api_key", "test-key")
    result = client.post("/api/food/ai/food-analyse", json={
        "images": [{"mime_type": "image/png", "data": "aGVsbG8="}],
    }, headers=H("alice"))
    assert result.status_code == 422
    with client.session_factory() as db:
        assert db.scalar(select(AICallLog)) is None


def test_create_food_with_validated_image(client):
    create_writable_catalog(client)
    result = client.post("/api/food/catalog", headers=H("alice"), json={
        "base_food_name": "Puttu", "category": "grain", "food_type": "processed", "image": image,
    })
    assert result.status_code == 201
    with client.session_factory() as db:
        from app.food_search import catalog
        stored = db.execute(select(catalog.c.image_data).where(catalog.c.id == result.json()["id"])).scalar_one()
        assert base64.b64decode(stored.split(",", 1)[1]).startswith(b"\xff\xd8\xff")
    invalid = client.post("/api/food/catalog", headers=H("alice"), json={
        "base_food_name": "Puttu", "category": "grain", "food_type": "processed",
        "image": {"mime_type": "image/png", "data": "aGVsbG8="},
    })
    assert invalid.status_code == 422
