from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.food_search import hybrid_food_search

router = APIRouter(prefix="/food", tags=["food"], dependencies=[Depends(get_current_user)])


class FoodSearchResult(BaseModel):
    id: str
    name: str


@router.get("/catalog", response_model=list[FoodSearchResult])
def search_catalog(
    q: str = Query(min_length=1, max_length=100),
    db: Session = Depends(get_db),
) -> list[FoodSearchResult]:
    query = q.strip()
    if not query:
        return []
    return [FoodSearchResult(id=food_id, name=name) for food_id, name in hybrid_food_search(db, query)]
