import re
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.ai.diagnostics import FoodFormatError
from app.ai.expense import Image, _validate_images, run_analysis
from app.ai.prompts import food_prompt
from app.auth import get_current_user
from app.config import settings
from app.db import get_db
from app.models import Profile
from app.routers_food import FoodCategory, FoodType

router = APIRouter(prefix="/food/ai", tags=["food AI"])


class FoodAnalysisRequest(BaseModel):
    images: list[Image] = Field(min_length=1, max_length=1)


class FoodAnalysisItem(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    canonical_name: str = Field(min_length=1, max_length=100)
    qty: float = Field(gt=0, allow_inf_nan=False)
    unit: Literal["g", "kg", "ml", "L", "Nos"]
    cal: int = Field(ge=0)
    food_type: FoodType
    food_category: FoodCategory

    @field_validator("name", "canonical_name")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Food name cannot be blank")
        return value


class FoodAnalysisResult(BaseModel):
    items: list[FoodAnalysisItem]


def parse_food_table(content: str) -> FoodAnalysisResult:
    lines = content.strip().splitlines()
    if not lines:
        raise FoodFormatError("empty_food_analysis")
    header = re.fullmatch(r"items\[(\d+)\](?:\{name,canonical_name,qty,unit,cal,food_type,food_category\})?:", lines[0])
    if not header:
        raise FoodFormatError("invalid_food_header")
    count = int(header.group(1))
    if count > 100 or count != len(lines) - 1:
        raise FoodFormatError("invalid_food_row_count")
    expected_header = "items[0]:" if count == 0 else (
        f"items[{count}]{{name,canonical_name,qty,unit,cal,food_type,food_category}}:"
    )
    if lines[0] != expected_header:
        raise FoodFormatError("invalid_food_header")
    items = []
    for row, line in enumerate(lines[1:], start=1):
        if not line.startswith("  "):
            raise FoodFormatError("invalid_food_row", row)
        values = [value.strip() for value in line.strip().split(",")]
        if len(values) != 7:
            raise FoodFormatError("invalid_food_columns", row)
        items.append(FoodAnalysisItem.model_validate(dict(zip(
            ("name", "canonical_name", "qty", "unit", "cal", "food_type", "food_category"), values
        ))))
    return FoodAnalysisResult(items=items)


@router.post("/food-analyse", response_model=FoodAnalysisResult)
def analyse_food(
    body: FoodAnalysisRequest,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FoodAnalysisResult:
    images = _validate_images(body.images)
    return run_analysis(
        user, db, "food_analysis",
        lambda provider: provider.food_request(settings.expense_ai_model, images, food_prompt()),
        parse_food_table,
    )
