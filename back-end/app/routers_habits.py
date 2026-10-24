import uuid
from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.models import Habit, HabitLog, Profile

router = APIRouter(prefix="/habits", tags=["habits"], dependencies=[Depends(get_current_user)])


class HabitIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=2000)
    frequency: Literal["daily", "weekly"] = "daily"
    target_per_week: int = Field(default=7, ge=1, le=7)


class HabitOut(HabitIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    status: str
    version: int


class HabitLogIn(BaseModel):
    logged_on: date
    completed: bool = True
    note: str | None = Field(default=None, max_length=2000)


class HabitLogOut(HabitLogIn):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    habit_id: uuid.UUID
    status: str
    version: int


def _owned_habit(db: Session, habit_id: uuid.UUID, user: Profile) -> Habit:
    habit = db.scalar(select(Habit).where(Habit.id == habit_id, Habit.user_id == user.id))
    if habit is None or habit.status != "active":
        raise HTTPException(404, "Habit not found")
    return habit


@router.get("", response_model=list[HabitOut])
def list_habits(user: Profile = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Habit)
        .where(Habit.user_id == user.id, Habit.status == "active")
        .order_by(Habit.created_at)
    ).all()


@router.post("", response_model=HabitOut, status_code=201)
def create_habit(
    body: HabitIn,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Habit name cannot be blank")
    habit = Habit(user_id=user.id, name=name, **body.model_dump(exclude={"name"}))
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return habit


@router.put("/{habit_id}", response_model=HabitOut)
def update_habit(
    habit_id: uuid.UUID,
    body: HabitIn,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    habit = _owned_habit(db, habit_id, user)
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Habit name cannot be blank")
    for field, value in body.model_dump().items():
        setattr(habit, field, name if field == "name" else value)
    habit.version += 1
    db.commit()
    db.refresh(habit)
    return habit


@router.delete("/{habit_id}", status_code=204)
def delete_habit(
    habit_id: uuid.UUID,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    habit = _owned_habit(db, habit_id, user)
    habit.status = "deleted"
    habit.version += 1
    db.commit()


@router.get("/{habit_id}/logs", response_model=list[HabitLogOut])
def list_logs(
    habit_id: uuid.UUID,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _owned_habit(db, habit_id, user)
    return db.scalars(
        select(HabitLog)
        .where(HabitLog.habit_id == habit_id, HabitLog.user_id == user.id, HabitLog.status == "active")
        .order_by(HabitLog.logged_on)
    ).all()


@router.put("/{habit_id}/logs", response_model=HabitLogOut)
def record_log(
    habit_id: uuid.UUID,
    body: HabitLogIn,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    _owned_habit(db, habit_id, user)
    log = db.scalar(
        select(HabitLog).where(
            HabitLog.habit_id == habit_id,
            HabitLog.user_id == user.id,
            HabitLog.logged_on == body.logged_on,
        )
    )
    if log is None:
        log = HabitLog(user_id=user.id, habit_id=habit_id, **body.model_dump())
        db.add(log)
    else:
        log.completed = body.completed
        log.note = body.note
        log.status = "active"
        log.version += 1
    db.commit()
    db.refresh(log)
    return log


@router.delete("/{habit_id}/logs/{logged_on}", status_code=204)
def delete_log(
    habit_id: uuid.UUID,
    logged_on: date,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = db.scalar(
        select(HabitLog).where(
            HabitLog.habit_id == habit_id,
            HabitLog.user_id == user.id,
            HabitLog.logged_on == logged_on,
            HabitLog.status == "active",
        )
    )
    if log is None:
        raise HTTPException(404, "Habit log not found")
    log.status = "deleted"
    log.version += 1
    db.commit()
