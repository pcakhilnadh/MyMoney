from typing import Annotated

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.food_search import hybrid_food_search

router = APIRouter(prefix="/food", tags=["food"], dependencies=[Depends(get_current_user)])


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
