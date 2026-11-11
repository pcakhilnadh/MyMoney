import re
from typing import Literal

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.ai.expense import Image, _validate_images, run_analysis
from app.auth import get_current_user
from app.config import settings
from app.db import get_db
from app.models import Profile
from app.routers_food import FoodCategory, FoodType

router = APIRouter(prefix="/food/ai", tags=["food AI"])

FOOD_PROMPT = """You are a food recognition engine for an Indian-first calorie tracker.
Identify every distinct food item visible in the photo.

Output ONLY a TOON table, with no prose and no markdown fences:

items[N]{name,canonical_name,qty,unit,kcal,food_type,food_category}:
  <one row per item, comma-separated, 2-space indent>

Rules:
- N = number of rows. If no food is visible, output exactly: items[0]:
- name: common name as served, e.g. "Rice puttu".
- canonical_name: lowercase, generic English catalog name with no brand, e.g. "rice puttu".
- qty: estimated portion visible, as a number.
- unit: exactly one of g, kg, ml, L, Nos. Use g for solids and ml for liquids (kg or L only if >=1000). Use Nos for countable items such as idli, egg or roti.
- kcal: integer, total calories for qty (not per 100 g).
- food_type: raw or processed. Cooked, packaged or mixed dishes are processed.
- food_category: exactly one of base_food, dairy, egg, fish, fruit, grain, ingredient, legume, meat, nut_seed, seafood, vegetable.
- Split mixed plates into separate items (e.g. sambar and puttu are two rows). Don't list plates, cutlery or garnish.
- Never put commas inside values.

Example:
items[2]{name,canonical_name,qty,unit,kcal,food_type,food_category}:
  Rice puttu,rice puttu,100,g,130,processed,grain
  Sambar,sambar,150,ml,90,processed,legume"""


class FoodAnalysisRequest(BaseModel):
    images: list[Image] = Field(min_length=1, max_length=1)


class FoodAnalysisItem(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    canonical_name: str = Field(min_length=1, max_length=100)
    qty: float = Field(gt=0, allow_inf_nan=False)
    unit: Literal["g", "kg", "ml", "L", "Nos"]
    kcal: int = Field(ge=0)
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
        raise ValueError("Empty food analysis")
    header = re.fullmatch(r"items\[(\d+)\](?:\{name,canonical_name,qty,unit,kcal,food_type,food_category\})?:", lines[0])
    if not header:
        raise ValueError("Invalid food analysis header")
    count = int(header.group(1))
    if count > 100 or count != len(lines) - 1:
        raise ValueError("Invalid food analysis row count")
    expected_header = "items[0]:" if count == 0 else (
        f"items[{count}]{{name,canonical_name,qty,unit,kcal,food_type,food_category}}:"
    )
    if lines[0] != expected_header:
        raise ValueError("Invalid food analysis header")
    items = []
    for line in lines[1:]:
        if not line.startswith("  "):
            raise ValueError("Invalid food analysis row")
        values = [value.strip() for value in line.strip().split(",")]
        if len(values) != 7:
            raise ValueError("Invalid food analysis columns")
        items.append(FoodAnalysisItem.model_validate(dict(zip(
            ("name", "canonical_name", "qty", "unit", "kcal", "food_type", "food_category"), values
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
        lambda provider: provider.food_request(settings.expense_ai_model, images, FOOD_PROMPT),
        parse_food_table,
    )
