from enum import StrEnum
from datetime import date
from decimal import Decimal
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import insert, select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.food_search import catalog, hybrid_food_search
from app.models import FoodGoal, Profile, UserMealLog
from app.ai.expense import Image, _validate_images

router = APIRouter(prefix="/food", tags=["food"], dependencies=[Depends(get_current_user)])


NutritionValue = Annotated[float, Field(ge=0, allow_inf_nan=False)]


class FoodCategory(StrEnum):
    BASE_FOOD = "base_food"
    DAIRY = "dairy"
    EGG = "egg"
    FISH = "fish"
    FRUIT = "fruit"
    GRAIN = "grain"
    INGREDIENT = "ingredient"
    LEGUME = "legume"
    MEAT = "meat"
    NUT_SEED = "nut_seed"
    SEAFOOD = "seafood"
    VEGETABLE = "vegetable"


class FoodType(StrEnum):
    PROCESSED = "processed"
    RAW = "raw"


class FoodCatalogCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    base_food_name: str = Field(min_length=1, max_length=100)
    aliases: str | None = Field(default=None, max_length=1000)
    description: str | None = Field(default=None, max_length=2000)
    category: FoodCategory
    food_type: FoodType
    calories_100g: NutritionValue | None = None
    protein_100g: NutritionValue | None = None
    carbs_100g: NutritionValue | None = None
    fat_100g: NutritionValue | None = None
    fiber_100g: NutritionValue | None = None
    image: Image | None = None

    @field_validator("base_food_name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Food name cannot be blank")
        return value


class FoodCatalogCreated(FoodCatalogCreate):
    id: str
    user_id: UUID


class FoodSearchResult(BaseModel):
    id: str
    name: str
    score: float = Field(
        ge=0.0,
        le=1.0,
        description=(
            "Match score: 1.0 for name substrings, 0.9 for alias-only substrings, "
            "otherwise fuzzy text similarity; not a probability."
        ),
    )
    calories_100g: float | None = None
    protein_100g: float | None = None
    carbs_100g: float | None = None
    fat_100g: float | None = None


class FoodBatchSearchRequest(BaseModel):
    queries: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(
        min_length=1, max_length=10,
    )


class FoodBatchSearchItem(BaseModel):
    query: str
    matches: list[FoodSearchResult]


class FoodBatchSearchResponse(BaseModel):
    results: list[FoodBatchSearchItem]


class MealType(StrEnum):
    BREAKFAST = "breakfast"
    LUNCH = "lunch"
    SNACKS = "snacks"
    DINNER = "dinner"


class FoodPortion(BaseModel):
    food_id: str = Field(min_length=1, max_length=200)
    weight_g: Decimal = Field(gt=0, le=1000000, max_digits=12, decimal_places=3, allow_inf_nan=False)


class FoodMealCreate(BaseModel):
    entry_date: date
    meal: MealType
    items: list[FoodPortion] = Field(min_length=1, max_length=100)


class FoodEntryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    entry_date: date
    meal: MealType
    food_id: str
    food_name: str
    weight_g: float
    calories: float | None
    protein: float | None
    carbs: float | None
    fat: float | None
    calories_100g: float | None
    protein_100g: float | None
    carbs_100g: float | None
    fat_100g: float | None
    image: str | None = None


class FoodGoalBody(BaseModel):
    calories: int = Field(strict=True, gt=0, le=100000)


@router.get("/goal")
def get_goal(user: Profile = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    goal = db.get(FoodGoal, user.id)
    return {"calories": goal.calories if goal else None}


@router.put("/goal")
def set_goal(body: FoodGoalBody, user: Profile = Depends(get_current_user), db: Session = Depends(get_db)) -> dict:
    goal = db.get(FoodGoal, user.id)
    if goal is None:
        goal = FoodGoal(user_id=user.id, calories=body.calories)
        db.add(goal)
    else:
        goal.calories = body.calories
    db.commit()
    return {"calories": goal.calories}


@router.get("/entries", response_model=list[FoodEntryResponse])
def list_entries(user: Profile = Depends(get_current_user), db: Session = Depends(get_db)) -> list[UserMealLog]:
    return list(db.scalars(
        select(UserMealLog)
        .where(UserMealLog.user_id == user.id, UserMealLog.status != "deleted")
        .order_by(UserMealLog.entry_date, UserMealLog.id)
    ))


@router.post("/entries", response_model=list[FoodEntryResponse], status_code=201)
def create_entries(body: FoodMealCreate, user: Profile = Depends(get_current_user), db: Session = Depends(get_db)) -> list[UserMealLog]:
    ids = {item.food_id for item in body.items}
    rows = db.execute(select(
        catalog.c.id, catalog.c.base_food_name, catalog.c.calories_100g,
        catalog.c.protein_100g, catalog.c.carbs_100g, catalog.c.fat_100g,
    ).where(catalog.c.id.in_(ids))).all()
    foods = {row.id: row for row in rows}
    if len(foods) != len(ids):
        raise HTTPException(status_code=404, detail="A selected food was not found in the catalogue.")
    entries = []
    for item in body.items:
        food = foods[item.food_id]
        def scaled(value):
            return None if value is None else value * item.weight_g / 100
        entries.append(UserMealLog(
            user_id=user.id, entry_date=body.entry_date, meal=body.meal,
            food_id=food.id, food_name=food.base_food_name, weight_g=item.weight_g,
            calories=scaled(food.calories_100g), protein=scaled(food.protein_100g),
            carbs=scaled(food.carbs_100g), fat=scaled(food.fat_100g),
            calories_100g=food.calories_100g, protein_100g=food.protein_100g,
            carbs_100g=food.carbs_100g, fat_100g=food.fat_100g,
        ))
    db.add_all(entries)
    db.commit()
    for entry in entries:
        db.refresh(entry)
    return entries


def _search_catalog(db: Session, query: str) -> list[FoodSearchResult]:
    query = query.strip()
    if not query:
        return []
    return [
        FoodSearchResult(**hit)
        for hit in hybrid_food_search(db, query)
    ]


@router.post("/catalog", response_model=FoodCatalogCreated, status_code=201)
def create_catalog_item(
    body: FoodCatalogCreate,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FoodCatalogCreated:
    food_id = str(uuid4())
    values = body.model_dump(exclude={"image"})
    if body.image is not None:
        mime, data = _validate_images([body.image])[0]
        values["image_data"] = f"data:{mime};base64,{data}"
    db.execute(insert(catalog).values(id=food_id, user_id=user.id, **values))
    db.commit()
    return FoodCatalogCreated(id=food_id, user_id=user.id, **body.model_dump())


@router.get("/catalog", response_model=list[FoodSearchResult], response_model_exclude_none=True)
def search_catalog(
    q: str = Query(min_length=1, max_length=100),
    db: Session = Depends(get_db),
) -> list[FoodSearchResult]:
    return _search_catalog(db, q)


@router.post("/catalog/search-batch", response_model=FoodBatchSearchResponse, response_model_exclude_none=True)
def search_catalog_batch(
    request: FoodBatchSearchRequest,
    db: Session = Depends(get_db),
) -> FoodBatchSearchResponse:
    return FoodBatchSearchResponse(results=[
        FoodBatchSearchItem(query=query, matches=_search_catalog(db, query))
        for query in request.queries
    ])
