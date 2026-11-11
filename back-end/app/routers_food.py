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


@router.get("/catalog", response_model=list[FoodSearchResult])
def search_catalog(
    q: str = Query(min_length=1, max_length=100),
    db: Session = Depends(get_db),
) -> list[FoodSearchResult]:
    query = q.strip()
    if not query:
        return []
    return [
        FoodSearchResult(id=food_id, name=name, score=score)
        for food_id, name, score in hybrid_food_search(db, query)
    ]
