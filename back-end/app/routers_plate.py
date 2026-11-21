"""MyPlate: meal planning across kitchens. Mounted at /api/plate, gated by the `plate` feature.

A kitchen is a workspace with its own week, cart and ideas. My Kitchen is a personal kitchen
with one member, created the first time MyPlate opens, so solo planning needs no second path.
Responses match the front end's types in `src/plate/types.ts`.
"""

import secrets
import uuid
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field
from sqlalchemy import and_, delete, or_, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.auth import GoogleIdentity, get_current_user, get_identity
from app.db import get_db
from app.entitlements import require_feature
from app.models import (
    AuthSession,
    GroupMember,
    PlateGroceryItem,
    PlateIdea,
    PlateIdeaVote,
    PlateKitchen,
    PlateKitchenInvite,
    PlateKitchenMember,
    PlateMeal,
    PlateMealAttendee,
    PlateMealReaction,
    PlatePrepTask,
    PlateDeletion,
    PlateSettings,
    Profile,
)
from app.plate_recipes import AISLES, RecipeImportError, guess_aisle, import_recipe

router = APIRouter(
    prefix="/plate",
    tags=["plate"],
    dependencies=[Depends(require_feature("plate"))],
)
# Local-first sync for phones: pull what changed in my kitchens (see `pull` below).
sync_router = APIRouter(
    prefix="/sync/plate",
    tags=["sync"],
    dependencies=[Depends(require_feature("plate"))],
)

KITCHEN_COLORS = ("#f97316", "#4ade80", "#2dd4bf", "#a78bfa", "#facc15", "#60a5fa", "#f472b6")
AVATAR_COLORS = ("#b4553d", "#4f9a6b", "#3a8f8a", "#9a6a3f", "#7d5aa8", "#b0577a")
SLOT_ORDER = ("B", "L", "S", "D")
SHOPPING_TTL = timedelta(hours=1)
MAX_RANGE_DAYS = 62
# A phone that syncs less often than tombstones are kept gets a full refresh instead.
TOMBSTONE_TTL = timedelta(days=90)
FULL_PULL_AFTER = timedelta(days=60)
# Phones keep this many weeks of past meals; older weeks load from /plate/meals on demand.
PAST_WEEKS = 8
# Rows committed just before a pull may carry a slightly earlier time than its cursor.
CURSOR_OVERLAP = timedelta(seconds=5)
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

Slot = Literal["B", "L", "S", "D"]
SharedType = Literal["couple", "family", "flatmates", "friends"]
ChefType = Literal["MEMBER", "TOGETHER", "TAKEOUT", "EATING_OUT"]
AisleName = Literal[AISLES]  # type: ignore[valid-type]


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _aware(value: datetime | None) -> datetime | None:
    """SQLite drops tzinfo; everything stored is UTC."""
    if value is None:
        return None
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _iso(value: datetime | None) -> str | None:
    value = _aware(value)
    return value.isoformat() if value else None


def _sid(value: uuid.UUID | None) -> str | None:
    return str(value) if value else None


def _avatar_color(user_id: uuid.UUID) -> str:
    return AVATAR_COLORS[user_id.int % len(AVATAR_COLORS)]


def _first_name(name: str | None) -> str | None:
    parts = (name or "").split()
    return parts[0][:60] if parts else None


# ─── Who's asking ────────────────────────────────────────────────────────────────────────


@dataclass
class Viewer:
    user: Profile
    name: str | None
    avatar: str | None

    @property
    def id(self) -> uuid.UUID:
        return self.user.id


def get_viewer(
    user: Profile = Depends(get_current_user),
    identity: GoogleIdentity = Depends(get_identity),
) -> Viewer:
    # Only the first name is ever shown to other members.
    return Viewer(user=user, name=_first_name(identity.name), avatar=identity.picture)


def _new_member(viewer: Viewer, role: str) -> PlateKitchenMember:
    return PlateKitchenMember(
        user_id=viewer.id,
        role=role,
        color=_avatar_color(viewer.id),
        display_name=viewer.name,
        avatar_url=viewer.avatar,
        last_seen_at=_now(),
    )


def _refresh_profile_cache(db: Session, viewer: Viewer) -> None:
    """Keep my cached first name and picture current on every kitchen I'm in."""
    rows = db.scalars(select(PlateKitchenMember).where(PlateKitchenMember.user_id == viewer.id))
    changed = False
    for row in rows:
        if viewer.name and (row.display_name != viewer.name or row.avatar_url != viewer.avatar):
            row.display_name, row.avatar_url = viewer.name, viewer.avatar
            changed = True
    if changed:
        db.commit()


def _ensure_personal(db: Session, viewer: Viewer) -> PlateKitchen:
    """My Kitchen exists from the first time MyPlate opens; one per user."""
    query = select(PlateKitchen).where(
        PlateKitchen.owner_id == viewer.id, PlateKitchen.is_personal.is_(True)
    )
    kitchen = db.scalar(query)
    if kitchen:
        return kitchen
    kitchen = PlateKitchen(
        name="My Kitchen",
        emoji="🙋",
        group_type="personal",
        is_personal=True,
        owner_id=viewer.id,
        color=KITCHEN_COLORS[0],
        meal_slots=["B", "L", "D"],
    )
    kitchen.members.append(_new_member(viewer, "owner"))
    db.add(kitchen)
    try:
        db.commit()
    except IntegrityError:
        # A concurrent first request created it.
        db.rollback()
        kitchen = db.scalar(query)
        if kitchen is None:
            raise
    return kitchen


# ─── Access ──────────────────────────────────────────────────────────────────────────────


def _membership(db: Session, kitchen_id: uuid.UUID, user_id: uuid.UUID) -> PlateKitchenMember | None:
    return db.scalar(
        select(PlateKitchenMember).where(
            PlateKitchenMember.kitchen_id == kitchen_id, PlateKitchenMember.user_id == user_id
        )
    )


def _require_kitchen(db: Session, kitchen_id: uuid.UUID, viewer: Viewer) -> PlateKitchen:
    member = _membership(db, kitchen_id, viewer.id)
    if member is None:
        # 404 rather than 403 so other people's kitchens aren't revealed.
        raise HTTPException(404, "That kitchen is no longer available.")
    return member.kitchen


def _my_kitchen_ids(viewer: Viewer):
    return select(PlateKitchenMember.kitchen_id).where(PlateKitchenMember.user_id == viewer.id)


def _require_meal(db: Session, meal_id: uuid.UUID, viewer: Viewer) -> tuple[PlateMeal, PlateKitchen]:
    meal = db.get(PlateMeal, meal_id)
    if meal is None or _membership(db, meal.kitchen_id, viewer.id) is None:
        raise HTTPException(404, "That meal was removed.")
    return meal, db.get(PlateKitchen, meal.kitchen_id)  # type: ignore[return-value]


def _touch(db: Session, kitchen: PlateKitchen, viewer: Viewer) -> None:
    """Record activity so other members see "new activity"; I've seen my own change."""
    now = _now()
    if not kitchen.is_personal:
        kitchen.last_activity_at = now
        kitchen.last_activity_by = viewer.id
    member = _membership(db, kitchen.id, viewer.id)
    if member:
        member.last_seen_at = now


def _tombstone(db: Session, kitchen_id: uuid.UUID, entity: str, ids) -> None:
    """Remember deletions so other members' phones drop the rows on their next sync."""
    now = _now()
    for entity_id in ids:
        db.add(
            PlateDeletion(kitchen_id=kitchen_id, entity=entity, entity_id=entity_id, deleted_at=now)
        )
    db.execute(
        delete(PlateDeletion).where(
            PlateDeletion.kitchen_id == kitchen_id, PlateDeletion.deleted_at < now - TOMBSTONE_TTL
        )
    )


def _existing(db: Session, model, row_id: uuid.UUID | None, viewer: Viewer):
    """A create retried by a phone (its id is already saved): return the saved row."""
    if row_id is None:
        return None
    row = db.get(model, row_id)
    if row is None:
        return None
    if _membership(db, row.kitchen_id, viewer.id) is None:
        raise HTTPException(409, "That id is already in use.")
    return row


# ─── People ──────────────────────────────────────────────────────────────────────────────


def _contact_ids(db: Session, viewer: Viewer) -> set[uuid.UUID]:
    """People I already plan or split money with. Invites are limited to them."""
    kitchen_people = select(PlateKitchenMember.user_id).where(
        PlateKitchenMember.kitchen_id.in_(_my_kitchen_ids(viewer))
    )
    my_groups = select(GroupMember.group_id).where(
        GroupMember.user_id == viewer.id, GroupMember.status == "active"
    )
    money_people = select(GroupMember.user_id).where(
        GroupMember.group_id.in_(my_groups),
        GroupMember.status == "active",
        GroupMember.user_id.is_not(None),
    )
    ids = set(db.scalars(kitchen_people)) | set(db.scalars(money_people))
    ids.discard(viewer.id)
    return ids


def _people(db: Session, user_ids: set[uuid.UUID], viewer: Viewer) -> list[dict]:
    """First names and pictures: latest session, else cached kitchen row, else money group."""
    if not user_ids:
        return []
    profiles = db.scalars(select(Profile).where(Profile.id.in_(user_ids))).all()
    subs = {p.google_sub: p.id for p in profiles}
    names: dict[uuid.UUID, str] = {}
    avatars: dict[uuid.UUID, str] = {}
    for session in db.scalars(
        select(AuthSession)
        .where(AuthSession.google_sub.in_(subs))
        .order_by(AuthSession.last_used_at.desc())
    ):
        user_id = subs[session.google_sub]
        if user_id not in names and (first := _first_name(session.name)):
            names[user_id] = first
        if user_id not in avatars and session.picture:
            avatars[user_id] = session.picture
    for member in db.scalars(
        select(PlateKitchenMember)
        .where(PlateKitchenMember.user_id.in_(user_ids))
        .order_by(PlateKitchenMember.joined_at.desc())
    ):
        if member.display_name:
            names.setdefault(member.user_id, member.display_name)
        if member.avatar_url:
            avatars.setdefault(member.user_id, member.avatar_url)
    for member in db.scalars(select(GroupMember).where(GroupMember.user_id.in_(user_ids))):
        if member.user_id and (first := _first_name(member.display_name)):
            names.setdefault(member.user_id, first)
    if viewer.name:
        names[viewer.id] = viewer.name
    if viewer.avatar:
        avatars[viewer.id] = viewer.avatar
    return sorted(
        (
            {
                "id": str(p.id),
                "name": names.get(p.id, "Someone"),
                "avatar": avatars.get(p.id),
                "color": _avatar_color(p.id),
            }
            for p in profiles
        ),
        key=lambda person: person["name"].lower(),
    )


@router.get("/me")
def me(viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)):
    _ensure_personal(db, viewer)
    _refresh_profile_cache(db, viewer)
    return _people(db, {viewer.id}, viewer)[0]


def _people_ids(db: Session, viewer: Viewer) -> set[uuid.UUID]:
    """Everyone MyPlate may show me: contacts, whoever invited me, whoever I invited."""
    inviters = set(
        db.scalars(
            select(PlateKitchenInvite.invited_by).where(
                PlateKitchenInvite.invited_user_id == viewer.id
            )
        )
    )
    invited = set(
        db.scalars(
            select(PlateKitchenInvite.invited_user_id).where(
                PlateKitchenInvite.kitchen_id.in_(_my_kitchen_ids(viewer))
            )
        )
    )
    return _contact_ids(db, viewer) | inviters | invited | {viewer.id}


@router.get("/people")
def people(viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)):
    return _people(db, _people_ids(db, viewer), viewer)


@router.get("/contacts")
def contacts(viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)):
    return _people(db, _contact_ids(db, viewer), viewer)


# ─── Kitchens ────────────────────────────────────────────────────────────────────────────


def _kitchen_out(kitchen: PlateKitchen, viewer: Viewer) -> dict:
    now = _now()
    shopping = {
        m.user_id: since
        for m in kitchen.members
        if (since := _aware(m.shopping_since)) and since > now - SHOPPING_TTL
    }
    mine = next((m for m in kitchen.members if m.user_id == viewer.id), None)
    activity = _aware(kitchen.last_activity_at)
    seen = _aware(mine.last_seen_at) if mine else None
    return {
        "id": str(kitchen.id),
        "name": kitchen.name,
        "emoji": kitchen.emoji,
        "group_type": kitchen.group_type,
        "is_personal": kitchen.is_personal,
        "owner_id": str(kitchen.owner_id),
        "color": kitchen.color,
        "meal_slots": [s for s in SLOT_ORDER if s in (kitchen.meal_slots or [])],
        "timezone": kitchen.timezone,
        "members": [
            {"user_id": str(m.user_id), "role": m.role, "color": m.color}
            for m in kitchen.members
        ],
        "invited": [str(i.invited_user_id) for i in kitchen.invites],
        "shopping_now": [str(user) for user in shopping],
        "shopping_since": {str(user): since.isoformat() for user, since in shopping.items()},
        "has_new_activity": bool(
            not kitchen.is_personal
            and activity
            and kitchen.last_activity_by != viewer.id
            and (seen is None or activity > seen)
        ),
    }


def _load_kitchens(db: Session, viewer: Viewer, ids: list[uuid.UUID] | None = None):
    query = (
        select(PlateKitchen)
        .where(PlateKitchen.id.in_(_my_kitchen_ids(viewer)))
        .options(selectinload(PlateKitchen.members), selectinload(PlateKitchen.invites))
        .order_by(PlateKitchen.created_at)
    )
    if ids is not None:
        query = query.where(PlateKitchen.id.in_(ids))
    return db.scalars(query).all()


@router.get("/kitchens")
def list_kitchens(viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)):
    _ensure_personal(db, viewer)
    return [_kitchen_out(k, viewer) for k in _load_kitchens(db, viewer)]


class KitchenIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    emoji: str = Field("🏡", min_length=1, max_length=16)
    group_type: SharedType
    meal_slots: list[Slot] = Field(default_factory=lambda: ["B", "L", "D"], min_length=1)
    timezone: str | None = Field(None, max_length=64)


@router.post("/kitchens", status_code=201)
def create_kitchen(
    body: KitchenIn, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
):
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Name the kitchen.")
    used = {k.color for k in _load_kitchens(db, viewer)}
    kitchen = PlateKitchen(
        name=name,
        emoji=body.emoji,
        group_type=body.group_type,
        is_personal=False,
        owner_id=viewer.id,
        color=next((c for c in KITCHEN_COLORS[1:] if c not in used), KITCHEN_COLORS[1]),
        meal_slots=[s for s in SLOT_ORDER if s in body.meal_slots],
        timezone=body.timezone or "Asia/Kolkata",
    )
    kitchen.members.append(_new_member(viewer, "owner"))
    db.add(kitchen)
    db.commit()
    return _kitchen_out(kitchen, viewer)


class KitchenPatch(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=60)
    emoji: str | None = Field(None, min_length=1, max_length=16)
    group_type: SharedType | None = None
    meal_slots: list[Slot] | None = Field(None, min_length=1)


@router.patch("/kitchens/{kitchen_id}")
def update_kitchen(
    kitchen_id: uuid.UUID,
    body: KitchenPatch,
    viewer: Viewer = Depends(get_viewer),
    db: Session = Depends(get_db),
):
    kitchen = _require_kitchen(db, kitchen_id, viewer)
    if body.group_type and kitchen.is_personal:
        raise HTTPException(422, "My Kitchen can't change type.")
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(422, "Name the kitchen.")
        kitchen.name = body.name.strip()
    if body.emoji is not None:
        kitchen.emoji = body.emoji
    if body.group_type is not None:
        kitchen.group_type = body.group_type
    if body.meal_slots is not None:
        kitchen.meal_slots = [s for s in SLOT_ORDER if s in body.meal_slots]
    _touch(db, kitchen, viewer)
    db.commit()
    return _kitchen_out(kitchen, viewer)


def _delete_kitchen(db: Session, kitchen: PlateKitchen) -> None:
    meal_ids = select(PlateMeal.id).where(PlateMeal.kitchen_id == kitchen.id)
    idea_ids = select(PlateIdea.id).where(PlateIdea.kitchen_id == kitchen.id)
    db.execute(delete(PlateIdeaVote).where(PlateIdeaVote.idea_id.in_(idea_ids)))
    db.execute(delete(PlateIdea).where(PlateIdea.kitchen_id == kitchen.id))
    db.execute(delete(PlateGroceryItem).where(PlateGroceryItem.kitchen_id == kitchen.id))
    db.execute(delete(PlateMealAttendee).where(PlateMealAttendee.meal_id.in_(meal_ids)))
    db.execute(delete(PlateMealReaction).where(PlateMealReaction.meal_id.in_(meal_ids)))
    db.execute(delete(PlatePrepTask).where(PlatePrepTask.meal_id.in_(meal_ids)))
    db.execute(
        update(PlateMeal).where(PlateMeal.kitchen_id == kitchen.id).values(leftover_of=None)
    )
    db.execute(delete(PlateMeal).where(PlateMeal.kitchen_id == kitchen.id))
    db.execute(
        update(PlateSettings)
        .where(PlateSettings.default_kitchen_id == kitchen.id)
        .values(default_kitchen_id=None)
    )
    db.delete(kitchen)


@router.delete("/kitchens/{kitchen_id}", status_code=204)
def delete_kitchen(
    kitchen_id: uuid.UUID, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
):
    kitchen = _require_kitchen(db, kitchen_id, viewer)
    if kitchen.is_personal:
        raise HTTPException(422, "My Kitchen can't be deleted.")
    if kitchen.owner_id != viewer.id:
        raise HTTPException(403, "Only the owner can delete a kitchen.")
    _delete_kitchen(db, kitchen)
    db.commit()
    return Response(status_code=204)


@router.delete("/kitchens/{kitchen_id}/members/me", status_code=204)
def leave_kitchen(
    kitchen_id: uuid.UUID, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
):
    kitchen = _require_kitchen(db, kitchen_id, viewer)
    if kitchen.is_personal:
        raise HTTPException(422, "My Kitchen can't be left.")
    mine = next(m for m in kitchen.members if m.user_id == viewer.id)
    kitchen.members.remove(mine)
    db.execute(
        update(PlateSettings)
        .where(
            PlateSettings.user_id == viewer.id, PlateSettings.default_kitchen_id == kitchen.id
        )
        .values(default_kitchen_id=None)
    )
    if not kitchen.members:
        _delete_kitchen(db, kitchen)
    else:
        if kitchen.owner_id == viewer.id:
            # Ownership passes to the longest-standing member.
            heir = kitchen.members[0]
            heir.role = "owner"
            kitchen.owner_id = heir.user_id
        kitchen.last_activity_at = _now()
        kitchen.last_activity_by = viewer.id
    db.commit()
    return Response(status_code=204)


@router.post("/kitchens/{kitchen_id}/seen", status_code=204)
def mark_seen(
    kitchen_id: uuid.UUID, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
):
    _require_kitchen(db, kitchen_id, viewer)
    _membership(db, kitchen_id, viewer.id).last_seen_at = _now()  # type: ignore[union-attr]
    db.commit()
    return Response(status_code=204)


class PresenceIn(BaseModel):
    kitchen_ids: list[uuid.UUID] = Field(min_length=1, max_length=50)
    shopping: bool


@router.put("/live/presence")
def set_presence(
    body: PresenceIn, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
):
    """Go live as shopping (or stop). It lapses after an hour so it never lingers."""
    now = _now()
    for kitchen_id in body.kitchen_ids:
        kitchen = _require_kitchen(db, kitchen_id, viewer)
        if kitchen.is_personal:
            raise HTTPException(422, "There is nobody to tell in My Kitchen.")
        _membership(db, kitchen_id, viewer.id).shopping_since = now if body.shopping else None  # type: ignore[union-attr]
    db.commit()
    return [_kitchen_out(k, viewer) for k in _load_kitchens(db, viewer, body.kitchen_ids)]


# ─── Invites ─────────────────────────────────────────────────────────────────────────────


class InviteUsersIn(BaseModel):
    user_ids: list[uuid.UUID] = Field(min_length=1, max_length=20)


@router.post("/kitchens/{kitchen_id}/invites")
def invite_users(
    kitchen_id: uuid.UUID,
    body: InviteUsersIn,
    viewer: Viewer = Depends(get_viewer),
    db: Session = Depends(get_db),
):
    kitchen = _require_kitchen(db, kitchen_id, viewer)
    if kitchen.is_personal:
        raise HTTPException(422, "My Kitchen is private. Start a shared kitchen.")
    known = _contact_ids(db, viewer)
    if any(user_id not in known for user_id in body.user_ids):
        raise HTTPException(422, "You can only invite people you already know on the app.")
    members = {m.user_id for m in kitchen.members}
    pending = {i.invited_user_id for i in kitchen.invites}
    for user_id in dict.fromkeys(body.user_ids):
        if user_id not in members and user_id not in pending:
            kitchen.invites.append(
                PlateKitchenInvite(invited_user_id=user_id, invited_by=viewer.id)
            )
    db.commit()
    return _kitchen_out(kitchen, viewer)


@router.post("/kitchens/{kitchen_id}/invite-code")
def invite_code(
    kitchen_id: uuid.UUID, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
):
    kitchen = _require_kitchen(db, kitchen_id, viewer)
    if kitchen.is_personal:
        raise HTTPException(422, "My Kitchen is private.")
    while kitchen.invite_code is None:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
        if db.scalar(select(PlateKitchen.id).where(PlateKitchen.invite_code == code)) is None:
            kitchen.invite_code = code
            db.commit()
    return {"code": kitchen.invite_code}


def _invites_out(db: Session, viewer: Viewer) -> list[dict]:
    rows = db.execute(
        select(PlateKitchenInvite, PlateKitchen)
        .join(PlateKitchen, PlateKitchen.id == PlateKitchenInvite.kitchen_id)
        .where(PlateKitchenInvite.invited_user_id == viewer.id)
        .order_by(PlateKitchenInvite.created_at)
    ).all()
    return [
        {
            "id": str(invite.id),
            "group_id": str(kitchen.id),
            "kitchen_name": kitchen.name,
            "kitchen_emoji": kitchen.emoji,
            "invited_by": str(invite.invited_by),
        }
        for invite, kitchen in rows
    ]


@router.get("/invites")
def list_invites(viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)):
    return _invites_out(db, viewer)


def _join(db: Session, kitchen: PlateKitchen, viewer: Viewer) -> None:
    if not any(m.user_id == viewer.id for m in kitchen.members):
        kitchen.members.append(_new_member(viewer, "member"))
        kitchen.last_activity_at = _now()
        kitchen.last_activity_by = viewer.id
    for invite in [i for i in kitchen.invites if i.invited_user_id == viewer.id]:
        kitchen.invites.remove(invite)


def _my_invite(db: Session, invite_id: uuid.UUID, viewer: Viewer) -> PlateKitchenInvite:
    invite = db.get(PlateKitchenInvite, invite_id)
    if invite is None or invite.invited_user_id != viewer.id:
        raise HTTPException(404, "This invite has expired.")
    return invite


@router.post("/invites/{invite_id}/accept")
def accept_invite(
    invite_id: uuid.UUID, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
):
    invite = _my_invite(db, invite_id, viewer)
    kitchen = db.get(PlateKitchen, invite.kitchen_id)
    _join(db, kitchen, viewer)  # type: ignore[arg-type]
    db.commit()
    return _kitchen_out(kitchen, viewer)  # type: ignore[arg-type]


@router.post("/invites/{invite_id}/decline", status_code=204)
def decline_invite(
    invite_id: uuid.UUID, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
):
    db.delete(_my_invite(db, invite_id, viewer))
    db.commit()
    return Response(status_code=204)


class JoinIn(BaseModel):
    code: str = Field(min_length=4, max_length=16)


@router.post("/invites/join")
def join_with_code(
    body: JoinIn, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
):
    kitchen = db.scalar(
        select(PlateKitchen).where(PlateKitchen.invite_code == body.code.strip().upper())
    )
    if kitchen is None:
        raise HTTPException(404, "That code doesn't match a kitchen. Check it and try again.")
    _join(db, kitchen, viewer)
    db.commit()
    return _kitchen_out(kitchen, viewer)


# ─── Meals ───────────────────────────────────────────────────────────────────────────────


def _meal_out(meal: PlateMeal) -> dict:
    return {
        "id": str(meal.id),
        "group_id": str(meal.kitchen_id),
        "meal_date": meal.meal_date.isoformat(),
        "meal_slot": meal.meal_slot,
        "title": meal.title,
        "sides": list(meal.sides or []),
        "leftover_of": _sid(meal.leftover_of),
        "chef_type": meal.chef_type,
        "chef_user_id": _sid(meal.chef_user_id),
        "attendees": [str(a.user_id) for a in meal.attendees],
        "guest_count": meal.guest_count,
        "reactions": {str(r.user_id): r.reaction for r in meal.reactions},
        "recipe_url": meal.recipe_url,
        "prep_tasks": [
            {
                "id": str(t.id),
                "meal_plan_id": str(meal.id),
                "title": t.title,
                "sort_order": t.sort_order,
                "done_by": _sid(t.done_by),
                "done_at": _iso(t.done_at),
            }
            for t in meal.prep_tasks
        ],
        "created_at": _iso(meal.created_at),
    }


def _meal_query():
    return select(PlateMeal).options(
        selectinload(PlateMeal.attendees),
        selectinload(PlateMeal.reactions),
        selectinload(PlateMeal.prep_tasks),
    )


@router.get("/meals")
def list_meals(
    from_: date = Query(alias="from"),
    to: date = Query(),
    viewer: Viewer = Depends(get_viewer),
    db: Session = Depends(get_db),
):
    """Meals in every kitchen I'm in. The All view merges these on the client."""
    if to < from_ or (to - from_).days > MAX_RANGE_DAYS:
        raise HTTPException(422, f"Ask for at most {MAX_RANGE_DAYS} days at a time.")
    meals = db.scalars(
        _meal_query()
        .where(
            PlateMeal.kitchen_id.in_(_my_kitchen_ids(viewer)),
            PlateMeal.meal_date >= from_,
            PlateMeal.meal_date <= to,
        )
        .order_by(PlateMeal.meal_date, PlateMeal.created_at)
    ).all()
    return [_meal_out(m) for m in meals]


class PrepTaskIn(BaseModel):
    id: uuid.UUID | None = None
    title: str = Field(max_length=200)


class MealIn(BaseModel):
    # Set by phones so a meal keeps its id while offline; retries return the saved meal.
    id: uuid.UUID | None = None
    group_id: uuid.UUID
    meal_date: date
    meal_slot: Slot
    title: str = Field(max_length=120)
    sides: list[str] = Field(default_factory=list, max_length=10)
    leftover_of: uuid.UUID | None = None
    chef_type: ChefType
    chef_user_id: uuid.UUID | None = None
    attendees: list[uuid.UUID] = Field(default_factory=list)
    guest_count: int = Field(0, ge=0, le=50)
    recipe_url: str | None = Field(None, max_length=500)
    prep_tasks: list[PrepTaskIn] = Field(default_factory=list, max_length=20)


def _apply_meal(
    db: Session, meal: PlateMeal, body: MealIn, kitchen: PlateKitchen, viewer: Viewer
) -> None:
    title = body.title.strip()
    if not title:
        raise HTTPException(422, "Give the meal a name.")
    members = {m.user_id for m in kitchen.members}
    if kitchen.is_personal and body.chef_type == "TOGETHER":
        raise HTTPException(422, "Cooking together needs a shared kitchen.")
    attendees = (
        [viewer.id]
        if kitchen.is_personal
        else [u for u in dict.fromkeys(body.attendees) if u in members]
    )
    if not attendees and body.guest_count == 0:
        raise HTTPException(422, "Pick at least one person who is eating.")
    source = None
    if body.leftover_of:
        source = db.get(PlateMeal, body.leftover_of)
        if source is None or source.kitchen_id != kitchen.id or source.id == meal.id:
            raise HTTPException(422, "The original meal was removed.")

    meal.kitchen_id = kitchen.id
    meal.meal_date = body.meal_date
    meal.meal_slot = body.meal_slot
    meal.title = title
    meal.sides = [s.strip()[:80] for s in body.sides if s.strip()]
    meal.leftover_of = source.id if source else None
    meal.chef_type = body.chef_type
    meal.chef_user_id = (
        (body.chef_user_id if body.chef_user_id in members and not kitchen.is_personal else viewer.id)
        if body.chef_type == "MEMBER"
        else None
    )
    meal.guest_count = body.guest_count
    meal.recipe_url = (body.recipe_url or "").strip() or None

    # Attendees: keep rows that stay, so composite keys never collide in one flush.
    keep = set(attendees)
    for row in [a for a in meal.attendees if a.user_id not in keep]:
        meal.attendees.remove(row)
    have = {a.user_id for a in meal.attendees}
    meal.attendees.extend(PlateMealAttendee(user_id=u) for u in attendees if u not in have)

    # Leftovers, takeout and eating out have nothing to prep. Ticks survive edits.
    no_prep = source is not None or body.chef_type in ("TAKEOUT", "EATING_OUT")
    existing = {t.id: t for t in meal.prep_tasks}
    tasks: list[PlatePrepTask] = []
    for task in [] if no_prep else body.prep_tasks:
        text = task.title.strip()
        if not text:
            continue
        row = existing.get(task.id) if task.id else None
        if row is None:
            fresh = task.id is not None and db.get(PlatePrepTask, task.id) is None
            row = PlatePrepTask(id=task.id, title=text) if fresh else PlatePrepTask(title=text)
        row.title, row.sort_order = text, len(tasks)
        tasks.append(row)
    meal.prep_tasks = tasks
    # Attendee and prep changes don't touch the meal row; phones pull by this time.
    meal.updated_at = _now()


@router.post("/meals", status_code=201)
def create_meal(body: MealIn, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)):
    kitchen = _require_kitchen(db, body.group_id, viewer)
    if saved := _existing(db, PlateMeal, body.id, viewer):
        return _meal_out(saved)
    meal = PlateMeal(created_by=viewer.id, attendees=[], prep_tasks=[], reactions=[])
    if body.id:
        meal.id = body.id
    _apply_meal(db, meal, body, kitchen, viewer)
    db.add(meal)
    _touch(db, kitchen, viewer)
    db.commit()
    return _meal_out(meal)


@router.put("/meals/{meal_id}")
def update_meal(
    meal_id: uuid.UUID,
    body: MealIn,
    viewer: Viewer = Depends(get_viewer),
    db: Session = Depends(get_db),
):
    meal, kitchen = _require_meal(db, meal_id, viewer)
    if body.group_id != meal.kitchen_id:
        raise HTTPException(422, "Meals can't move between kitchens.")
    _apply_meal(db, meal, body, kitchen, viewer)
    _touch(db, kitchen, viewer)
    db.commit()
    return _meal_out(meal)


@router.delete("/meals/{meal_id}", status_code=204)
def delete_meal(
    meal_id: uuid.UUID, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
):
    meal, kitchen = _require_meal(db, meal_id, viewer)
    now = _now()
    # Removing a meal removes the leftovers planned from it.
    leftovers = db.scalars(select(PlateMeal).where(PlateMeal.leftover_of == meal.id)).all()
    gone = [meal, *leftovers]
    gone_ids = [m.id for m in gone]
    db.execute(
        update(PlateGroceryItem)
        .where(PlateGroceryItem.meal_id.in_(gone_ids))
        .values(meal_id=None, updated_at=now)
    )
    for row in leftovers:
        row.leftover_of = None  # so the original can be deleted first
    db.flush()
    for row in gone:
        db.delete(row)
    _tombstone(db, kitchen.id, "meals", gone_ids)
    _touch(db, kitchen, viewer)
    db.commit()
    return Response(status_code=204)


class ReactionIn(BaseModel):
    reaction: Literal["heart", "up"] | None


@router.put("/meals/{meal_id}/reaction")
def set_reaction(
    meal_id: uuid.UUID,
    body: ReactionIn,
    viewer: Viewer = Depends(get_viewer),
    db: Session = Depends(get_db),
):
    meal, kitchen = _require_meal(db, meal_id, viewer)
    if kitchen.is_personal:
        raise HTTPException(422, "Reactions are for shared kitchens.")
    mine = next((r for r in meal.reactions if r.user_id == viewer.id), None)
    if body.reaction is None:
        if mine:
            meal.reactions.remove(mine)
    elif mine:
        mine.reaction = body.reaction
    else:
        meal.reactions.append(PlateMealReaction(user_id=viewer.id, reaction=body.reaction))
    meal.updated_at = _now()
    _touch(db, kitchen, viewer)
    db.commit()
    return _meal_out(meal)


class PrepDoneIn(BaseModel):
    done: bool


@router.patch("/prep-tasks/{task_id}")
def set_prep_done(
    task_id: uuid.UUID,
    body: PrepDoneIn,
    viewer: Viewer = Depends(get_viewer),
    db: Session = Depends(get_db),
):
    task = db.get(PlatePrepTask, task_id)
    if task is None:
        raise HTTPException(404, "That task was removed.")
    meal, kitchen = _require_meal(db, task.meal_id, viewer)
    task.done_by = viewer.id if body.done else None
    task.done_at = _now() if body.done else None
    meal.updated_at = _now()
    _touch(db, kitchen, viewer)
    db.commit()
    return _meal_out(meal)


@router.post("/meals/{meal_id}/leftovers", status_code=201)
def plan_leftovers(
    meal_id: uuid.UUID, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
):
    """Leftovers go in the kitchen's next empty slot after the meal, within three days."""
    original, kitchen = _require_meal(db, meal_id, viewer)
    taken = {
        (m.meal_date, m.meal_slot)
        for m in db.scalars(
            select(PlateMeal).where(
                PlateMeal.kitchen_id == kitchen.id,
                PlateMeal.meal_date >= original.meal_date,
                PlateMeal.meal_date <= original.meal_date + timedelta(days=3),
            )
        )
    }
    slots = [s for s in SLOT_ORDER if s in (kitchen.meal_slots or [])]
    rank = SLOT_ORDER.index(original.meal_slot)
    target = next(
        (
            (day, slot)
            for offset in range(4)
            for day in [original.meal_date + timedelta(days=offset)]
            for slot in slots
            if (offset > 0 or SLOT_ORDER.index(slot) > rank) and (day, slot) not in taken
        ),
        None,
    )
    if target is None:
        raise HTTPException(422, "No free slot in the next three days for leftovers.")
    base = original.title.removesuffix(" (leftovers)")
    meal = PlateMeal(
        kitchen_id=kitchen.id,
        meal_date=target[0],
        meal_slot=target[1],
        title=f"{base} (leftovers)"[:120],
        sides=list(original.sides or []),
        leftover_of=original.id,
        chef_type=original.chef_type,
        chef_user_id=original.chef_user_id,
        guest_count=0,
        recipe_url=original.recipe_url,
        created_by=viewer.id,
        attendees=[PlateMealAttendee(user_id=a.user_id) for a in original.attendees],
        prep_tasks=[],
        reactions=[],
    )
    db.add(meal)
    _touch(db, kitchen, viewer)
    db.commit()
    return _meal_out(meal)


class CopyWeekIn(BaseModel):
    from_group_id: uuid.UUID
    to_group_id: uuid.UUID
    from_week: date
    to_week: date


@router.post("/meals/copy-week")
def copy_week(body: CopyWeekIn, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)):
    """Copy one week into the empty slots of another week or kitchen. Originals stay put."""
    source_kitchen = _require_kitchen(db, body.from_group_id, viewer)
    target = _require_kitchen(db, body.to_group_id, viewer)
    shift = body.to_week - body.from_week
    week = timedelta(days=6)
    source = db.scalars(
        _meal_query()
        .where(
            PlateMeal.kitchen_id == source_kitchen.id,
            PlateMeal.meal_date >= body.from_week,
            PlateMeal.meal_date <= body.from_week + week,
            # Leftovers point at a meal that isn't being copied.
            PlateMeal.leftover_of.is_(None),
        )
        .order_by(PlateMeal.meal_date, PlateMeal.created_at)
    ).all()
    taken = {
        (m.meal_date, m.meal_slot)
        for m in db.scalars(
            select(PlateMeal).where(
                PlateMeal.kitchen_id == target.id,
                PlateMeal.meal_date >= body.to_week,
                PlateMeal.meal_date <= body.to_week + week,
            )
        )
    }
    members = [m.user_id for m in target.members]
    same = source_kitchen.id == target.id
    copied = 0
    for meal in source:
        key = (meal.meal_date + shift, meal.meal_slot)
        if key in taken:
            continue
        taken.add(key)
        chef_type = meal.chef_type
        if target.is_personal and chef_type == "TOGETHER":
            chef_type = "MEMBER"
        chef = meal.chef_user_id if meal.chef_user_id in members else viewer.id
        attendees = (
            [a.user_id for a in meal.attendees]
            if same
            else ([viewer.id] if target.is_personal else members)
        )
        db.add(
            PlateMeal(
                kitchen_id=target.id,
                meal_date=key[0],
                meal_slot=key[1],
                title=meal.title,
                sides=list(meal.sides or []),
                chef_type=chef_type,
                chef_user_id=chef if chef_type == "MEMBER" else None,
                guest_count=meal.guest_count,
                recipe_url=meal.recipe_url,
                created_by=viewer.id,
                attendees=[PlateMealAttendee(user_id=u) for u in attendees],
                prep_tasks=[
                    PlatePrepTask(title=t.title, sort_order=t.sort_order) for t in meal.prep_tasks
                ],
                reactions=[],
            )
        )
        copied += 1
    if copied:
        _touch(db, target, viewer)
    db.commit()
    return {"copied": copied}


# ─── Cart ────────────────────────────────────────────────────────────────────────────────


def _item_out(item: PlateGroceryItem) -> dict:
    return {
        "id": str(item.id),
        "group_id": str(item.kitchen_id),
        "name": item.name,
        "quantity": item.quantity,
        "aisle": item.aisle,
        "meal_plan_id": _sid(item.meal_id),
        "added_by": str(item.added_by),
        "checked_by": _sid(item.checked_by),
        "checked_at": _iso(item.checked_at),
        "created_at": _iso(item.created_at),
    }


@router.get("/grocery-items")
def list_groceries(viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)):
    items = db.scalars(
        select(PlateGroceryItem)
        .where(PlateGroceryItem.kitchen_id.in_(_my_kitchen_ids(viewer)))
        .order_by(PlateGroceryItem.created_at)
    ).all()
    return [_item_out(i) for i in items]


class GroceryIn(BaseModel):
    id: uuid.UUID | None = None
    group_id: uuid.UUID
    name: str = Field(min_length=1, max_length=120)
    quantity: str = Field("", max_length=40)
    aisle: AisleName | None = None  # type: ignore[valid-type]
    meal_plan_id: uuid.UUID | None = None


@router.post("/grocery-items", status_code=201)
def add_grocery(body: GroceryIn, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)):
    kitchen = _require_kitchen(db, body.group_id, viewer)
    if saved := _existing(db, PlateGroceryItem, body.id, viewer):
        return _item_out(saved)
    name = body.name.strip()
    if not name:
        raise HTTPException(422, "Name the item.")
    if body.meal_plan_id:
        meal = db.get(PlateMeal, body.meal_plan_id)
        if meal is None or meal.kitchen_id != kitchen.id:
            raise HTTPException(422, "That meal isn't in this kitchen.")
    item = PlateGroceryItem(
        id=body.id or uuid.uuid4(),
        kitchen_id=kitchen.id,
        name=name,
        quantity=body.quantity.strip(),
        aisle=body.aisle or guess_aisle(name),
        meal_id=body.meal_plan_id,
        added_by=viewer.id,
    )
    db.add(item)
    _touch(db, kitchen, viewer)
    db.commit()
    return _item_out(item)


def _require_item(db: Session, item_id: uuid.UUID, viewer: Viewer):
    item = db.get(PlateGroceryItem, item_id)
    if item is None or _membership(db, item.kitchen_id, viewer.id) is None:
        raise HTTPException(404, "That item was removed.")
    return item, db.get(PlateKitchen, item.kitchen_id)


class CheckedIn(BaseModel):
    checked: bool


@router.patch("/grocery-items/{item_id}")
def set_checked(
    item_id: uuid.UUID,
    body: CheckedIn,
    viewer: Viewer = Depends(get_viewer),
    db: Session = Depends(get_db),
):
    item, kitchen = _require_item(db, item_id, viewer)
    item.checked_by = viewer.id if body.checked else None
    item.checked_at = _now() if body.checked else None
    _touch(db, kitchen, viewer)  # type: ignore[arg-type]
    db.commit()
    return _item_out(item)


@router.delete("/grocery-items/{item_id}", status_code=204)
def delete_grocery(
    item_id: uuid.UUID, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
):
    item, kitchen = _require_item(db, item_id, viewer)
    db.delete(item)
    _tombstone(db, item.kitchen_id, "grocery_items", [item.id])
    _touch(db, kitchen, viewer)  # type: ignore[arg-type]
    db.commit()
    return Response(status_code=204)


class ClearCheckedIn(BaseModel):
    group_ids: list[uuid.UUID] = Field(min_length=1, max_length=50)


@router.post("/grocery-items/clear-checked", status_code=204)
def clear_checked(
    body: ClearCheckedIn, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
):
    for kitchen_id in dict.fromkeys(body.group_ids):
        kitchen = _require_kitchen(db, kitchen_id, viewer)
        checked = (
            PlateGroceryItem.kitchen_id == kitchen.id,
            PlateGroceryItem.checked_at.is_not(None),
        )
        ids = db.scalars(select(PlateGroceryItem.id).where(*checked)).all()
        _tombstone(db, kitchen.id, "grocery_items", ids)
        db.execute(delete(PlateGroceryItem).where(*checked))
        _touch(db, kitchen, viewer)
    db.commit()
    return Response(status_code=204)


# ─── Ideas ───────────────────────────────────────────────────────────────────────────────


def _idea_out(idea: PlateIdea) -> dict:
    return {
        "id": str(idea.id),
        "group_id": str(idea.kitchen_id),
        "title": idea.title,
        "added_by": str(idea.added_by),
        "votes": [str(v.user_id) for v in idea.votes],
        "recipe_url": idea.recipe_url,
        "created_at": _iso(idea.created_at),
    }


@router.get("/ideas")
def list_ideas(viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)):
    ideas = db.scalars(
        select(PlateIdea)
        .where(PlateIdea.kitchen_id.in_(_my_kitchen_ids(viewer)))
        .options(selectinload(PlateIdea.votes))
        .order_by(PlateIdea.created_at)
    ).all()
    return [_idea_out(i) for i in ideas]


class IdeaIn(BaseModel):
    id: uuid.UUID | None = None
    group_id: uuid.UUID
    title: str = Field(min_length=1, max_length=120)
    recipe_url: str | None = Field(None, max_length=500)


@router.post("/ideas", status_code=201)
def add_idea(body: IdeaIn, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)):
    kitchen = _require_kitchen(db, body.group_id, viewer)
    if saved := _existing(db, PlateIdea, body.id, viewer):
        return _idea_out(saved)
    title = body.title.strip()
    if not title:
        raise HTTPException(422, "Name the idea.")
    idea = PlateIdea(
        id=body.id or uuid.uuid4(),
        kitchen_id=kitchen.id,
        title=title,
        recipe_url=(body.recipe_url or "").strip() or None,
        added_by=viewer.id,
        # Suggesting an idea in a shared kitchen counts as your vote for it.
        votes=[] if kitchen.is_personal else [PlateIdeaVote(user_id=viewer.id)],
    )
    db.add(idea)
    _touch(db, kitchen, viewer)
    db.commit()
    return _idea_out(idea)


def _require_idea(db: Session, idea_id: uuid.UUID, viewer: Viewer):
    idea = db.get(PlateIdea, idea_id)
    if idea is None or _membership(db, idea.kitchen_id, viewer.id) is None:
        raise HTTPException(404, "That idea was removed.")
    return idea, db.get(PlateKitchen, idea.kitchen_id)


class VoteIn(BaseModel):
    voted: bool


@router.put("/ideas/{idea_id}/vote")
def vote(
    idea_id: uuid.UUID,
    body: VoteIn,
    viewer: Viewer = Depends(get_viewer),
    db: Session = Depends(get_db),
):
    idea, kitchen = _require_idea(db, idea_id, viewer)
    if kitchen.is_personal:  # type: ignore[union-attr]
        raise HTTPException(422, "Wishlist ideas have no votes.")
    mine = next((v for v in idea.votes if v.user_id == viewer.id), None)
    if body.voted and mine is None:
        idea.votes.append(PlateIdeaVote(user_id=viewer.id))
    elif not body.voted and mine is not None:
        idea.votes.remove(mine)
    idea.updated_at = _now()
    _touch(db, kitchen, viewer)  # type: ignore[arg-type]
    db.commit()
    return _idea_out(idea)


@router.delete("/ideas/{idea_id}", status_code=204)
def delete_idea(
    idea_id: uuid.UUID, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
):
    idea, kitchen = _require_idea(db, idea_id, viewer)
    if idea.added_by != viewer.id and kitchen.owner_id != viewer.id:  # type: ignore[union-attr]
        raise HTTPException(403, "Only whoever suggested it, or the kitchen owner, can remove it.")
    db.delete(idea)
    _tombstone(db, idea.kitchen_id, "ideas", [idea.id])
    _touch(db, kitchen, viewer)  # type: ignore[arg-type]
    db.commit()
    return Response(status_code=204)


# ─── Settings ────────────────────────────────────────────────────────────────────────────


def _settings_out(row: PlateSettings | None) -> dict:
    return {
        "default_group_id": _sid(row.default_kitchen_id) if row else None,
        "reminder_enabled": row.reminder_enabled if row else True,
        "reminder_time": row.reminder_time if row else "20:00",
    }


@router.get("/settings")
def get_settings(viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)):
    return _settings_out(db.get(PlateSettings, viewer.id))


class SettingsPatch(BaseModel):
    default_group_id: uuid.UUID | None = None
    reminder_enabled: bool | None = None
    reminder_time: str | None = Field(None, pattern=r"^\d{2}:\d{2}$")


@router.patch("/settings")
def update_settings(
    body: SettingsPatch, viewer: Viewer = Depends(get_viewer), db: Session = Depends(get_db)
):
    row = db.get(PlateSettings, viewer.id)
    if row is None:
        row = PlateSettings(user_id=viewer.id, reminder_enabled=True, reminder_time="20:00")
        db.add(row)
    fields = body.model_fields_set
    if "default_group_id" in fields:
        # Null means "All kitchens".
        if body.default_group_id is not None:
            _require_kitchen(db, body.default_group_id, viewer)
        row.default_kitchen_id = body.default_group_id
    if "reminder_enabled" in fields and body.reminder_enabled is not None:
        row.reminder_enabled = body.reminder_enabled
    if "reminder_time" in fields and body.reminder_time is not None:
        if not "19:00" <= body.reminder_time <= "22:00":
            raise HTTPException(422, "Pick a reminder time between 7 and 10 PM.")
        row.reminder_time = body.reminder_time
    db.commit()
    return _settings_out(row)


# ─── Recipe import ───────────────────────────────────────────────────────────────────────


class ImportIn(BaseModel):
    url: str = Field(min_length=8, max_length=500)


@router.post("/recipes/import")
def recipe_import(body: ImportIn, viewer: Viewer = Depends(get_viewer)):
    """Name and ingredients from a recipe page (schema.org Recipe), else the link's name."""
    try:
        return import_recipe(body.url.strip())
    except RecipeImportError as error:
        raise HTTPException(422, str(error)) from None


# ─── Sync ────────────────────────────────────────────────────────────────────────────────


def _cutoff(since: datetime | None) -> datetime | None:
    """Pull rows changed after this; None means send everything."""
    since = _aware(since)
    if since is None or since < _now() - FULL_PULL_AFTER:
        return None
    return since - CURSOR_OVERLAP


@sync_router.get("/pull")
def pull(
    since: datetime | None = None,
    viewer: Viewer = Depends(get_viewer),
    db: Session = Depends(get_db),
):
    """What a phone needs to show MyPlate offline.

    Kitchens, people, invites and settings are small and always come whole. Meals, cart
    items and ideas come as changes since `since`, with the ids of rows deleted since then.
    The first pull, and any kitchen joined since `since`, comes whole (meals from
    PAST_WEEKS ago on). Kitchens missing from `kitchens` were left or deleted.
    Writes still go through the /plate routes, which keep every rule in one place.
    """
    _ensure_personal(db, viewer)
    _refresh_profile_cache(db, viewer)
    server_time = _now()
    cutoff = _cutoff(since)
    kitchens = _load_kitchens(db, viewer)
    joined = {
        m.kitchen_id: _aware(m.joined_at)
        for m in db.scalars(select(PlateKitchenMember).where(PlateKitchenMember.user_id == viewer.id))
    }
    full = [k.id for k in kitchens if cutoff is None or joined[k.id] > cutoff]
    delta = [k.id for k in kitchens if k.id not in full]
    oldest = (server_time - timedelta(weeks=PAST_WEEKS)).date()

    def changed(model):
        recent = and_(model.kitchen_id.in_(delta), model.updated_at > cutoff) if delta else None
        whole = model.kitchen_id.in_(full) if full else None
        if model is PlateMeal and whole is not None:
            whole = and_(whole, PlateMeal.meal_date >= oldest)
        parts = [p for p in (whole, recent) if p is not None]
        return or_(*parts) if parts else None

    def rows(query, model):
        condition = changed(model)
        return [] if condition is None else db.scalars(query.where(condition)).all()

    meals = rows(_meal_query().order_by(PlateMeal.meal_date, PlateMeal.created_at), PlateMeal)
    items = rows(select(PlateGroceryItem).order_by(PlateGroceryItem.created_at), PlateGroceryItem)
    ideas = rows(
        select(PlateIdea).options(selectinload(PlateIdea.votes)).order_by(PlateIdea.created_at),
        PlateIdea,
    )
    deleted: dict[str, list[str]] = {"meals": [], "grocery_items": [], "ideas": []}
    if delta:
        for tomb in db.scalars(
            select(PlateDeletion).where(
                PlateDeletion.kitchen_id.in_(delta), PlateDeletion.deleted_at > cutoff
            )
        ):
            deleted[tomb.entity].append(str(tomb.entity_id))

    everyone = _people(db, _people_ids(db, viewer), viewer)
    contacts = {str(i) for i in _contact_ids(db, viewer)}
    return {
        "server_time": server_time.isoformat(),
        "me": next(p for p in everyone if p["id"] == str(viewer.id)),
        "people": everyone,
        "contact_ids": sorted(contacts),
        "kitchens": [_kitchen_out(k, viewer) for k in kitchens],
        "invites": _invites_out(db, viewer),
        "settings": _settings_out(db.get(PlateSettings, viewer.id)),
        "full_kitchens": [str(k) for k in full],
        "meals_from": oldest.isoformat(),
        "meals": [_meal_out(m) for m in meals],
        "grocery_items": [_item_out(i) for i in items],
        "ideas": [_idea_out(i) for i in ideas],
        "deleted": deleted,
    }
