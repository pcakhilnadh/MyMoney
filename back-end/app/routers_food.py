from enum import StrEnum
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator
from sqlalchemy import insert
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.food_search import catalog, hybrid_food_search
from app.models import Profile

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


class FoodBatchSearchRequest(BaseModel):
    queries: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(
        min_length=1, max_length=10,
    )


class FoodBatchSearchItem(BaseModel):
    query: str
    matches: list[FoodSearchResult]


class FoodBatchSearchResponse(BaseModel):
    results: list[FoodBatchSearchItem]


def _search_catalog(db: Session, query: str) -> list[FoodSearchResult]:
    query = query.strip()
    if not query:
        return []
    return [
        FoodSearchResult(id=food_id, name=name, score=score)
        for food_id, name, score in hybrid_food_search(db, query)
    ]


@router.post("/catalog", response_model=FoodCatalogCreated, status_code=201)
def create_catalog_item(
    body: FoodCatalogCreate,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FoodCatalogCreated:
    food_id = str(uuid4())
    db.execute(insert(catalog).values(id=food_id, user_id=user.id, **body.model_dump()))
    db.commit()
    return FoodCatalogCreated(id=food_id, user_id=user.id, **body.model_dump())


@router.get("/catalog", response_model=list[FoodSearchResult])
def search_catalog(
    q: str = Query(min_length=1, max_length=100),
    db: Session = Depends(get_db),
) -> list[FoodSearchResult]:
    return _search_catalog(db, q)


@router.post("/catalog/search-batch", response_model=FoodBatchSearchResponse)
def search_catalog_batch(
    request: FoodBatchSearchRequest,
    db: Session = Depends(get_db),
) -> FoodBatchSearchResponse:
    return FoodBatchSearchResponse(results=[
        FoodBatchSearchItem(query=query, matches=_search_catalog(db, query))
        for query in request.queries
    ])
