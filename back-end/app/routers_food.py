import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import FoodEntry, FoodLibraryItem, Profile

router = APIRouter(prefix="/food", tags=["food"], dependencies=[Depends(get_current_user)])


class FoodEntryIn(BaseModel):
    entry_date: date
    meal: Literal["breakfast", "lunch", "snacks", "dinner"]
    name: str = Field(min_length=1, max_length=200)
    quantity: Decimal = Field(gt=0, max_digits=10, decimal_places=2)
    unit: str = Field(min_length=1, max_length=40)


class FoodEntryOut(FoodEntryIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    version: int


class FoodLibraryItemIn(BaseModel):
    name: str = Field(min_length=1, max_length=200)


class FoodLibraryItemOut(FoodLibraryItemIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID


@router.get("/entries", response_model=list[FoodEntryOut])
def list_entries(
    start: date | None = None,
    end: date | None = None,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    query = select(FoodEntry).where(
        FoodEntry.user_id == user.id,
        FoodEntry.status == "active",
    )
    if start is not None:
        query = query.where(FoodEntry.entry_date >= start)
    if end is not None:
        query = query.where(FoodEntry.entry_date <= end)
    return db.scalars(query.order_by(FoodEntry.entry_date, FoodEntry.created_at)).all()


@router.post("/entries", response_model=FoodEntryOut, status_code=201)
def create_entry(
    body: FoodEntryIn,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = body.name.strip()
    unit = body.unit.strip()
    if not name or not unit:
        raise HTTPException(422, "Food name and unit cannot be blank")
    entry = FoodEntry(user_id=user.id, name=name, unit=unit, **body.model_dump(exclude={"name", "unit"}))
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/entries/{entry_id}", status_code=204)
def delete_entry(
    entry_id: uuid.UUID,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    entry = db.scalar(select(FoodEntry).where(FoodEntry.id == entry_id, FoodEntry.user_id == user.id))
    if entry is None:
        raise HTTPException(404, "Food entry not found")
    entry.status = "deleted"
    entry.version += 1
    db.commit()


@router.get("/library", response_model=list[FoodLibraryItemOut])
def list_library(user: Profile = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(FoodLibraryItem)
        .where(FoodLibraryItem.user_id == user.id, FoodLibraryItem.status == "active")
        .order_by(FoodLibraryItem.name)
    ).all()


@router.post("/library", response_model=FoodLibraryItemOut, status_code=201)
def add_library_item(
    body: FoodLibraryItemIn,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = " ".join(body.name.split())
    normalized_name = name.casefold()
    if not normalized_name:
        raise HTTPException(422, "Food name cannot be empty")
    existing = db.scalar(
        select(FoodLibraryItem).where(
            FoodLibraryItem.user_id == user.id,
            FoodLibraryItem.normalized_name == normalized_name,
            FoodLibraryItem.status == "active",
        )
    )
    if existing is not None:
        return existing
    item = FoodLibraryItem(user_id=user.id, name=name, normalized_name=normalized_name)
    db.add(item)
    db.commit()
    db.refresh(item)
    return item
