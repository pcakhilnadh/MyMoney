import base64
import binascii
import io
import json
import re
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Literal

import requests
from fastapi import APIRouter, Depends, HTTPException
from PIL import Image as PILImage, ImageOps, UnidentifiedImageError
from pydantic import BaseModel, Field, StrictBool, ValidationError, field_validator
from sqlalchemy.orm import Session

from app.ai.diagnostics import request_error_details, response_error_details
from app.ai.provider import NvidiaProvider, Provider
from app.auth import get_current_user
from app.config import settings
from app.db import get_db
from app.models import AICallLog, Profile

router = APIRouter(prefix="/money/ai", tags=["money AI"])
MAX_TOTAL_BYTES = settings.max_image_upload_mb * 1024 * 1024
MAX_COMPRESSED_TOTAL_BYTES = 3 * 1024 * 1024
MAX_IMAGE_DIMENSION = 2000
MAX_IMAGE_PIXELS = 40_000_000


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


def _compress_image(image: PILImage.Image, target_bytes: int) -> bytes:
    image.thumbnail((MAX_IMAGE_DIMENSION, MAX_IMAGE_DIMENSION), PILImage.Resampling.LANCZOS)
    for _ in range(12):
        for quality in (85, 70, 55, 40):
            output = io.BytesIO()
            image.save(output, format="JPEG", quality=quality, optimize=True)
            compressed = output.getvalue()
            if len(compressed) <= target_bytes:
                return compressed
        width, height = image.size
        if width == 1 and height == 1:
            break
        image = image.resize(
            (max(1, int(width * 0.8)), max(1, int(height * 0.8))),
            PILImage.Resampling.LANCZOS,
        )
    raise HTTPException(422, "Unable to compress image")


def _validate_images(images: list[Image]) -> list[tuple[str, str]]:
    total = 0
    decoded_images: list[tuple[Image, bytes]] = []
    for image in images:
        data = base64.b64decode(image.data)
        total += len(data)
        if total > MAX_TOTAL_BYTES:
            raise HTTPException(413, f"Images must total at most {settings.max_image_upload_mb} MB")
        valid = (
            (image.mime_type == "image/jpeg" and data.startswith(b"\xff\xd8\xff"))
            or (image.mime_type == "image/png" and data.startswith(b"\x89PNG\r\n\x1a\n"))
            or (image.mime_type == "image/webp" and data[:4] == b"RIFF" and data[8:12] == b"WEBP")
        )
        if not valid:
            raise HTTPException(422, "Unsupported or invalid image")
        decoded_images.append((image, data))

    compressed_images = []
    target_bytes = MAX_COMPRESSED_TOTAL_BYTES // len(decoded_images)
    for image, data in decoded_images:
        try:
            with PILImage.open(io.BytesIO(data)) as source:
                expected_format = {
                    "image/jpeg": "JPEG",
                    "image/png": "PNG",
                    "image/webp": "WEBP",
                }[image.mime_type]
                if source.format != expected_format or source.width * source.height > MAX_IMAGE_PIXELS:
                    raise HTTPException(422, "Unsupported or invalid image")
                source.load()
                converted = ImageOps.exif_transpose(source)
                if converted.mode in ("RGBA", "LA") or "transparency" in converted.info:
                    rgba = converted.convert("RGBA")
                    background = PILImage.new("RGB", rgba.size, "white")
                    background.paste(rgba, mask=rgba.getchannel("A"))
                    converted = background
                else:
                    converted = converted.convert("RGB")
                compressed = _compress_image(converted, target_bytes)
        except (OSError, UnidentifiedImageError, PILImage.DecompressionBombError) as exc:
            raise HTTPException(422, "Unsupported or invalid image") from exc
        compressed_images.append(("image/jpeg", base64.b64encode(compressed).decode("ascii")))
    return compressed_images


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
    compressed_images = _validate_images(body.images)
    if settings.expense_ai_provider != "nvidia" or not settings.nvidia_api_key:
        raise HTTPException(503, "Expense AI is not configured")
    provider: Provider = NvidiaProvider(settings.nvidia_base_url, settings.nvidia_api_key)
    payload = provider.expense_request(
        settings.expense_ai_model,
        compressed_images,
        body.categories,
    )
    started_at = datetime.now(timezone.utc)
    log = AICallLog(
        user_id=user.id, task="expense_analysis", provider="nvidia",
        model=settings.expense_ai_model, status="pending",
        request_payload=_redact_secret(payload, settings.nvidia_api_key),
        created_at=started_at,
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
    except requests.Timeout as exc:
        log.error = request_error_details(exc, settings.nvidia_base_url)
        raise HTTPException(504, "AI provider timed out. Please try again later.") from exc
    except requests.ConnectionError as exc:
        log.error = request_error_details(exc, settings.nvidia_base_url)
        raise HTTPException(502, "Could not connect to the AI provider. Please try again later.") from exc
    except requests.RequestException as exc:
        log.error = request_error_details(exc, settings.nvidia_base_url)
        raise HTTPException(502, "AI provider request failed. Please try again later.") from exc
    except (ValueError, KeyError, IndexError, TypeError, ValidationError) as exc:
        log.error = response_error_details(exc)
        raise HTTPException(502, "AI provider returned an invalid response")
    finally:
        if log.status != "success":
            log.status = "failed"
        log.completed_at = datetime.now(timezone.utc)
        log.elapsed_ms = max(0, round((log.completed_at - started_at).total_seconds() * 1000))
        db.commit()
