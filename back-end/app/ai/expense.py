import base64
import binascii
import json
import re
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Literal

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, StrictBool, ValidationError, field_validator
from sqlalchemy.orm import Session

from app.ai.provider import NvidiaProvider, Provider
from app.auth import get_current_user
from app.config import settings
from app.db import get_db
from app.models import AICallLog, Profile

router = APIRouter(prefix="/money/ai", tags=["money AI"])
MAX_TOTAL_BYTES = 3 * 1024 * 1024


class Image(BaseModel):
    mime_type: Literal["image/jpeg", "image/png", "image/webp"]
    data: str = Field(max_length=MAX_TOTAL_BYTES * 4 // 3 + 4)

    @field_validator("data")
    @classmethod
    def valid_base64(cls, value: str) -> str:
        try:
            base64.b64decode(value, validate=True)
        except (ValueError, binascii.Error):
            raise ValueError("Invalid image encoding")
        return value


class ExpenseRequest(BaseModel):
    images: list[Image] = Field(min_length=1, max_length=3)
    categories: list[str] = Field(max_length=200)

    @field_validator("categories")
    @classmethod
    def valid_categories(cls, values: list[str]) -> list[str]:
        if any(not value.strip() or len(value) > 120 for value in values):
            raise ValueError("Invalid category")
        return values


class BillItem(BaseModel):
    name: str | None = None
    quantity: str | float | None = None
    amount: str | float | None = None


class ExpenseResult(BaseModel):
    is_bill: StrictBool
    title: str | None = Field(default=None, max_length=120)
    total_amount: Decimal | None = Field(
        default=None, gt=0, le=Decimal("21474836.47"), max_digits=10, decimal_places=2
    )
    bill_date: date | None = None
    merchant_name: str | None = Field(default=None, max_length=200)
    summary: str | None = Field(default=None, max_length=1000)
    category: str | None = None
    items: list[BillItem] = Field(default_factory=list)


def _validate_images(images: list[Image]) -> None:
    total = 0
    for image in images:
        data = base64.b64decode(image.data)
        total += len(data)
        valid = (
            (image.mime_type == "image/jpeg" and data.startswith(b"\xff\xd8\xff"))
            or (image.mime_type == "image/png" and data.startswith(b"\x89PNG\r\n\x1a\n"))
            or (image.mime_type == "image/webp" and data[:4] == b"RIFF" and data[8:12] == b"WEBP")
        )
        if not valid:
            raise HTTPException(422, "Unsupported or invalid image")
    if total > MAX_TOTAL_BYTES:
        raise HTTPException(413, "Images must total at most 3 MB")


def _redact_secret(value, secret: str):
    if isinstance(value, str):
        return value.replace(secret, "[redacted]")
    if isinstance(value, list):
        return [_redact_secret(item, secret) for item in value]
    if isinstance(value, dict):
        return {
            _redact_secret(key, secret): _redact_secret(item, secret)
            for key, item in value.items()
        }
    return value


@router.post("/expense", response_model=ExpenseResult)
def analyse_expense(
    body: ExpenseRequest,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> ExpenseResult:
    _validate_images(body.images)
    if settings.expense_ai_provider != "nvidia" or not settings.nvidia_api_key:
        raise HTTPException(503, "Expense AI is not configured")
    provider: Provider = NvidiaProvider(settings.nvidia_base_url, settings.nvidia_api_key)
    payload = provider.expense_request(
        settings.expense_ai_model,
        [(image.mime_type, image.data) for image in body.images],
        body.categories,
    )
    log = AICallLog(
        user_id=user.id, task="expense_analysis", provider="nvidia",
        model=settings.expense_ai_model, status="pending",
        request_payload=_redact_secret(payload, settings.nvidia_api_key),
    )
    db.add(log)
    db.commit()
    try:
        response = provider.send(payload)
        log.http_status = response.status_code
        try:
            raw = response.json()
        except requests.exceptions.JSONDecodeError:
            raw = {"unparsed_body": response.text}
        log.response_payload = _redact_secret(
            raw if isinstance(raw, dict) else {"body": raw}, settings.nvidia_api_key
        )
        usage = provider.usage(raw) if isinstance(raw, dict) else {}
        if isinstance(usage, dict):
            for source, target in (("prompt_tokens", "input_tokens"), ("completion_tokens", "output_tokens"), ("total_tokens", "total_tokens")):
                value = usage.get(source)
                if isinstance(value, int) and not isinstance(value, bool) and value >= 0:
                    setattr(log, target, value)
        if not response.ok:
            log.error = "Provider returned an error"
            raise HTTPException(502, "AI provider could not analyse the bill")
        if not isinstance(raw, dict):
            raise ValueError("Invalid response body")
        content = provider.content(raw)
        content = re.sub(r"^```(?:json)?\s*|\s*```$", "", content.strip(), flags=re.IGNORECASE)
        parsed = json.loads(content)
        if isinstance(parsed, dict) and parsed.get("is_bill") is False:
            result = ExpenseResult(is_bill=False)
        else:
            result = ExpenseResult.model_validate(parsed)
        if result.category not in body.categories:
            result.category = None
        log.status = "success"
        return result
    except requests.RequestException:
        log.error = "Provider request failed"
        raise HTTPException(502, "Could not reach the AI provider")
    except (ValueError, KeyError, IndexError, TypeError, ValidationError):
        log.error = "Invalid provider response"
        raise HTTPException(502, "AI provider returned an invalid response")
    finally:
        if log.status != "success":
            log.status = "failed"
        log.completed_at = datetime.now(timezone.utc)
        db.commit()
