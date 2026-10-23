import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app import schemas as s
from app.access import active_group, audit, require_admin, require_member
from app.auth import GoogleIdentity, get_current_user, get_identity
from app.db import get_db
from app.mailer import invite_email, send_email
from app.models import (
    Account,
    Budget,
    Category,
    ExpenseGroup,
    GroupMember,
    Profile,
    Settlement,
    SplitAllocation,
    Transaction,
)
from app.splits import SplitError, compute_shares, net_balances, simplify_debts

router = APIRouter(dependencies=[Depends(get_current_user)])


# ---------- accounts & categories ----------
@router.get("/accounts", response_model=list[s.AccountOut])
def list_accounts(user: Profile = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Account).where(Account.user_id == user.id, Account.status == "active")
    ).all()


@router.post("/accounts", response_model=s.AccountOut, status_code=201)
def create_account(
    body: s.AccountIn, user: Profile = Depends(get_current_user), db: Session = Depends(get_db)
):
    acc = Account(user_id=user.id, **body.model_dump())
    db.add(acc)
    db.commit()
    return acc


@router.get("/categories", response_model=list[s.CategoryOut])
def list_categories(user: Profile = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(Category).where((Category.user_id == user.id) | (Category.is_system.is_(True)))
    ).all()


@router.post("/categories", response_model=s.CategoryOut, status_code=201)
def create_category(
    body: s.CategoryIn, user: Profile = Depends(get_current_user), db: Session = Depends(get_db)
):
    cat = Category(user_id=user.id, is_system=False, **body.model_dump())
    db.add(cat)
    db.commit()
    return cat


# ---------- transactions ----------
def _visible_filter(user: Profile, db: Session):
    group_ids = select(GroupMember.group_id).where(
        GroupMember.user_id == user.id, GroupMember.status == "active"
    )
    return (Transaction.status == "active") & (
        (Transaction.owner_user_id == user.id) | Transaction.group_id.in_(group_ids)
    )


def _validated_splits(db: Session, body: s.TransactionIn, user: Profile):
    """Validate group/context rules and return list[(user_id, share, paid)]."""
    if body.context == "personal":
        if body.group_id or body.splits:
            raise HTTPException(422, "Personal transactions cannot have a group or splits")
        account = db.get(Account, body.account_id)
        if account is None or account.user_id != user.id or account.status != "active":
            raise HTTPException(422, "An active account owned by the caller is required")
        return []
    if body.group_id is None:
        raise HTTPException(422, "group_id required for family/group transactions")
    require_member(db, body.group_id, user)
    active_group(db, body.group_id)
    account = db.get(Account, body.account_id)
    if account is None or account.user_id != user.id or account.status != "active":
        raise HTTPException(422, "An active account owned by the caller is required")
    if not body.splits:
        return []
    method = body.split_method or "equal"
    active_ids = set(
        db.scalars(
            select(GroupMember.user_id).where(
                GroupMember.group_id == body.group_id, GroupMember.status == "active"
            )
        )
    )
    if any(sp.user_id not in active_ids for sp in body.splits):
        raise HTTPException(422, "All participants must be active group members")
    if len({sp.user_id for sp in body.splits}) != len(body.splits):
        raise HTTPException(422, "Duplicate participant")
    try:
        shares = compute_shares(
            method, body.amount_minor, {str(sp.user_id): sp.value for sp in body.splits}
        )
    except SplitError as e:
        raise HTTPException(422, str(e)) from e
    paid = {str(sp.user_id): sp.paid_minor for sp in body.splits}
    if sum(paid.values()) == 0:  # default: creator paid everything
        paid = {str(user.id): body.amount_minor}
    elif sum(paid.values()) != body.amount_minor:
        raise HTTPException(422, "Paid amounts must sum to the transaction amount")
    uids = set(shares) | set(paid)
    if any(uuid.UUID(u) not in active_ids for u in uids):
        raise HTTPException(422, "Payer must be an active group member")
    return [(u, shares.get(u, 0), paid.get(u, 0)) for u in uids]


@router.post("/transactions", response_model=s.TransactionOut, status_code=201)
def create_transaction(
    body: s.TransactionIn, user: Profile = Depends(get_current_user), db: Session = Depends(get_db)
):
    if body.client_id:  # idempotent replay
        existing = db.scalar(
            select(Transaction).where(
                Transaction.owner_user_id == user.id, Transaction.client_id == body.client_id
            )
        )
        if existing:
            return existing
    rows = _validated_splits(db, body, user)
    data = body.model_dump(exclude={"splits"})
    tx = Transaction(created_by=user.id, owner_user_id=user.id, is_shared=bool(rows), **data)
    if rows:
        tx.split_method = body.split_method or "equal"
    for uid, share, paid in rows:
        tx.splits.append(SplitAllocation(user_id=uuid.UUID(uid), share_minor=share, paid_minor=paid))
    db.add(tx)
    db.flush()
    audit(db, user, "transaction", tx.id, "create", new={"amount_minor": tx.amount_minor})
    db.commit()
    return tx


@router.get("/transactions", response_model=list[s.TransactionOut])
def list_transactions(
    context: str | None = None,
    group_id: uuid.UUID | None = None,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = (
        select(Transaction)
        .options(selectinload(Transaction.splits))
        .where(_visible_filter(user, db))
        .order_by(Transaction.transaction_date.desc())
    )
    if context:
        q = q.where(Transaction.context == context)
    if group_id:
        q = q.where(Transaction.group_id == group_id)
    return db.scalars(q).all()


def _owned_tx(db: Session, tx_id: uuid.UUID, user: Profile) -> Transaction:
    tx = db.get(Transaction, tx_id)
    if tx is None or tx.status != "active" or tx.owner_user_id != user.id:
        raise HTTPException(404, "Transaction not found")
    return tx


@router.delete("/transactions/{tx_id}", status_code=204)
def delete_transaction(
    tx_id: uuid.UUID, user: Profile = Depends(get_current_user), db: Session = Depends(get_db)
):
    tx = _owned_tx(db, tx_id, user)
    tx.status = "deleted"
    tx.deleted_at = datetime.now(timezone.utc)
    tx.version += 1
    audit(db, user, "transaction", tx.id, "delete")
    db.commit()


# ---------- groups ----------
@router.post("/groups", response_model=s.GroupOut, status_code=201)
def create_group(
    body: s.GroupIn,
    user: Profile = Depends(get_current_user),
    identity: GoogleIdentity = Depends(get_identity),
    db: Session = Depends(get_db),
):
    g = ExpenseGroup(created_by=user.id, **body.model_dump())
    db.add(g)
    db.flush()
    db.add(
        GroupMember(
            group_id=g.id,
            email=user.email,
            user_id=user.id,
            display_name=identity.name,
            role="owner",
            status="active",
            joined_at=datetime.now(timezone.utc),
        )
    )
    audit(db, user, "group", g.id, "create")
    db.commit()
    return g


@router.get("/groups", response_model=list[s.GroupOut])
def my_groups(user: Profile = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(ExpenseGroup)
        .join(GroupMember)
        .where(
            GroupMember.user_id == user.id,
            GroupMember.status == "active",
            ExpenseGroup.status == "active",
        )
    ).all()


@router.delete("/groups/{group_id}", status_code=204)
def delete_group(
    group_id: uuid.UUID, user: Profile = Depends(get_current_user), db: Session = Depends(get_db)
):
    member = require_member(db, group_id, user)
    if member.role != "owner":
        raise HTTPException(403, "Only the group owner can delete this group")
    group = active_group(db, group_id)
    if group.created_by != user.id:
        raise HTTPException(403, "Only the group owner can delete this group")
    group.status = "inactive"
    for group_member in db.scalars(
        select(GroupMember).where(GroupMember.group_id == group_id)
    ):
        group_member.status = "inactive"
    audit(db, user, "group", group.id, "delete")
    db.commit()


@router.get("/groups/invitations", response_model=list[s.GroupOut])
def my_invitations(user: Profile = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.scalars(
        select(ExpenseGroup)
        .join(GroupMember)
        .where(GroupMember.email == user.email, GroupMember.status == "invited")
    ).all()


@router.get("/groups/{group_id}/members", response_model=list[s.MemberOut])
def members(
    group_id: uuid.UUID, user: Profile = Depends(get_current_user), db: Session = Depends(get_db)
):
    require_member(db, group_id, user)
    return db.scalars(select(GroupMember).where(GroupMember.group_id == group_id)).all()


@router.delete("/groups/{group_id}/members/me", status_code=204)
def leave_group(
    group_id: uuid.UUID, user: Profile = Depends(get_current_user), db: Session = Depends(get_db)
):
    member = require_member(db, group_id, user)
    if member.role == "owner":
        raise HTTPException(403, "The group owner cannot leave; delete the group instead")
    member.status = "inactive"
    audit(db, user, "group_member", member.id, "leave", old={"status": "active"})
    db.commit()


@router.post("/groups/{group_id}/members", response_model=s.MemberOut, status_code=201)
def invite(
    group_id: uuid.UUID,
    body: s.InviteIn,
    background: BackgroundTasks,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    require_admin(db, group_id, user)
    if body.role not in ("admin", "member"):
        raise HTTPException(422, "Invalid role")
    group = active_group(db, group_id)
    email = body.email.strip().lower()
    m = db.scalar(
        select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.email == email)
    )
    if m is not None and m.status != "inactive":
        raise HTTPException(409, "Already invited or a member")
    if m is None:
        m = GroupMember(
            group_id=group_id, email=email, role=body.role, status="invited", invited_by=user.id
        )
        db.add(m)
        action = "invite"
    else:
        m.role = body.role
        m.status = "invited"
        m.invited_by = user.id
        m.joined_at = None
        action = "reinvite"
    db.flush()
    audit(db, user, "group_member", m.id, action, new={"email": email, "role": body.role})
    db.commit()
    background.add_task(send_email, email, *invite_email(group.name, user.email))
    return m


@router.post("/groups/{group_id}/join", response_model=s.MemberOut)
def join(
    group_id: uuid.UUID,
    user: Profile = Depends(get_current_user),
    identity: GoogleIdentity = Depends(get_identity),
    db: Session = Depends(get_db),
):
    m = db.scalar(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.email == user.email,
            GroupMember.status == "invited",
        )
    )
    if m is None:
        raise HTTPException(404, "No invitation found")
    m.user_id = user.id
    m.display_name = identity.name  # captured at join time only
    m.status = "active"
    m.joined_at = datetime.now(timezone.utc)
    audit(db, user, "group_member", m.id, "join")
    db.commit()
    return m


def _group_net(db: Session, group_id: uuid.UUID) -> dict[str, int]:
    splits = db.execute(
        select(SplitAllocation.user_id, SplitAllocation.share_minor, SplitAllocation.paid_minor)
        .join(Transaction)
        .where(Transaction.group_id == group_id, Transaction.status == "active")
    ).all()
    setl = db.execute(
        select(Settlement.payer_user_id, Settlement.receiver_user_id, Settlement.amount_minor).where(
            Settlement.group_id == group_id, Settlement.status != "cancelled"
        )
    ).all()
    return net_balances(
        [(str(u), sh, p) for u, sh, p in splits], [(str(a), str(b), n) for a, b, n in setl]
    )


@router.get("/groups/{group_id}/balances")
def balances(
    group_id: uuid.UUID, user: Profile = Depends(get_current_user), db: Session = Depends(get_db)
):
    require_member(db, group_id, user)
    net = _group_net(db, group_id)
    return {
        "net": net,
        "transfers": [
            {"from": a, "to": b, "amount_minor": n} for a, b, n in simplify_debts(net)
        ],
    }


# ---------- settlements ----------
@router.post("/settlements", response_model=s.SettlementOut, status_code=201)
def create_settlement(
    body: s.SettlementIn, user: Profile = Depends(get_current_user), db: Session = Depends(get_db)
):
    if body.receiver_user_id == user.id:
        raise HTTPException(422, "Cannot settle with yourself")
    if body.client_id:
        existing = db.scalar(
            select(Settlement).where(
                Settlement.created_by == user.id, Settlement.client_id == body.client_id
            )
        )
        if existing:
            return existing
    if body.group_id:
        require_member(db, body.group_id, user)
        recv = db.scalar(
            select(GroupMember).where(
                GroupMember.group_id == body.group_id,
                GroupMember.user_id == body.receiver_user_id,
                GroupMember.status == "active",
            )
        )
        if recv is None:
            raise HTTPException(422, "Receiver is not an active group member")
    st = Settlement(
        created_by=user.id,
        payer_user_id=user.id,
        status="settled",
        settled_at=datetime.now(timezone.utc),
        **body.model_dump(),
    )
    db.add(st)
    db.flush()
    audit(db, user, "settlement", st.id, "create", new={"amount_minor": st.amount_minor})
    db.commit()
    return st


@router.get("/settlements", response_model=list[s.SettlementOut])
def list_settlements(
    group_id: uuid.UUID | None = None,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = select(Settlement).where(
        (Settlement.payer_user_id == user.id) | (Settlement.receiver_user_id == user.id)
    )
    if group_id:
        q = q.where(Settlement.group_id == group_id)
    return db.scalars(q.order_by(Settlement.created_at.desc())).all()


# ---------- budgets ----------
@router.post("/budgets", response_model=s.BudgetOut, status_code=201)
def create_budget(
    body: s.BudgetIn, user: Profile = Depends(get_current_user), db: Session = Depends(get_db)
):
    if body.period_end and body.period_end < body.period_start:
        raise HTTPException(422, "period_end precedes period_start")
    if body.group_id:
        require_admin(db, body.group_id, user)
    b = Budget(
        created_by=user.id,
        owner_user_id=None if body.group_id else user.id,
        **body.model_dump(),
    )
    db.add(b)
    db.commit()
    return b


@router.get("/budgets", response_model=list[s.BudgetOut])
def list_budgets(user: Profile = Depends(get_current_user), db: Session = Depends(get_db)):
    group_ids = select(GroupMember.group_id).where(
        GroupMember.user_id == user.id, GroupMember.status == "active"
    )
    return db.scalars(
        select(Budget).where(
            Budget.is_active.is_(True),
            (Budget.owner_user_id == user.id) | Budget.group_id.in_(group_ids),
        )
    ).all()


# ---------- insights ----------
@router.get("/insights/summary")
def summary(
    year: int,
    month: int,
    context: str | None = None,
    user: Profile = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Spend for the month for the caller: own personal expenses, plus the caller's share of
    shared expenses."""
    start = datetime(year, month, 1, tzinfo=timezone.utc)
    end = datetime(year + (month == 12), month % 12 + 1, 1, tzinfo=timezone.utc)
    q = (
        select(Transaction)
        .options(selectinload(Transaction.splits))
        .where(
            _visible_filter(user, db),
            Transaction.transaction_type == "expense",
            Transaction.transaction_date >= start,
            Transaction.transaction_date < end,
        )
    )
    if context:
        q = q.where(Transaction.context == context)
    total = 0
    by_cat: dict[str, int] = {}
    for tx in db.scalars(q):
        if tx.is_shared:
            mine = sum(sp.share_minor for sp in tx.splits if sp.user_id == user.id)
        else:
            mine = tx.amount_minor if tx.owner_user_id == user.id else 0
        total += mine
        key = str(tx.category_id) if tx.category_id else "uncategorised"
        by_cat[key] = by_cat.get(key, 0) + mine
    return {"total_minor": total, "by_category": by_cat}
