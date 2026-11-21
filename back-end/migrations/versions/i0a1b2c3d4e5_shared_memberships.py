"""Kitchens keep invites as member rows, like money groups; money groups get join codes

Kitchen members now carry an email, a status (`invited` or `active`) and who invited
them, the same shape as `group_members`. Pending kitchen invites move into that table and
`plate_kitchen_invites` is dropped. Money groups get a no-expiry join code.

Revision ID: i0a1b2c3d4e5
Revises: h9c0d1e2f3a4
Create Date: 2026-11-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "i0a1b2c3d4e5"
down_revision: Union[str, Sequence[str], None] = "h9c0d1e2f3a4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PROFILE_EMAIL = "(SELECT lower(p.email) FROM profiles p WHERE p.id = {column})"


def upgrade() -> None:
    with op.batch_alter_table("plate_kitchen_members") as batch:
        batch.add_column(sa.Column("email", sa.String(320), nullable=True))
        batch.add_column(
            sa.Column("status", sa.String(10), nullable=False, server_default="active")
        )
        batch.add_column(
            sa.Column(
                "invited_by",
                sa.Uuid(),
                sa.ForeignKey("profiles.id", name="fk_plate_kitchen_members_invited_by"),
                nullable=True,
            )
        )
        batch.add_column(sa.Column("created_at", sa.DateTime(timezone=True), nullable=True))
        batch.alter_column("user_id", existing_type=sa.Uuid(), nullable=True)
        batch.alter_column("color", existing_type=sa.String(9), nullable=True)
        batch.alter_column("joined_at", existing_type=sa.DateTime(timezone=True), nullable=True)

    # Members: their sign-in email, and their join time as the row's creation time.
    op.execute(
        "UPDATE plate_kitchen_members SET email = "
        + PROFILE_EMAIL.format(column="plate_kitchen_members.user_id")
        + ", created_at = joined_at"
    )
    # Pending invites become invited rows, unless that person is already a member.
    invite_email = "COALESCE(i.invited_email, " + PROFILE_EMAIL.format(
        column="i.invited_user_id"
    ) + ")"
    op.execute(
        "INSERT INTO plate_kitchen_members"
        " (id, kitchen_id, email, status, invited_by, role, created_at)"
        f" SELECT i.id, i.kitchen_id, {invite_email}, 'invited', i.invited_by, 'member',"
        " i.created_at FROM plate_kitchen_invites i"
        f" WHERE {invite_email} IS NOT NULL AND NOT EXISTS ("
        "  SELECT 1 FROM plate_kitchen_members m"
        f"  WHERE m.kitchen_id = i.kitchen_id AND m.email = {invite_email})"
    )

    with op.batch_alter_table("plate_kitchen_members") as batch:
        batch.alter_column("created_at", existing_type=sa.DateTime(timezone=True), nullable=False)
        batch.create_unique_constraint("uq_plate_kitchen_members_email", ["kitchen_id", "email"])
        batch.create_check_constraint(
            "ck_plate_kitchen_members_status", "status IN ('invited', 'active')"
        )
    op.create_index("ix_plate_kitchen_members_email", "plate_kitchen_members", ["email"])

    op.drop_index("ix_plate_kitchen_invites_invited_email", table_name="plate_kitchen_invites")
    op.drop_table("plate_kitchen_invites")

    with op.batch_alter_table("expense_groups") as batch:
        batch.add_column(sa.Column("invite_code", sa.String(16), nullable=True))
        batch.create_unique_constraint("uq_expense_groups_invite_code", ["invite_code"])


def downgrade() -> None:
    with op.batch_alter_table("expense_groups") as batch:
        batch.drop_constraint("uq_expense_groups_invite_code", type_="unique")
        batch.drop_column("invite_code")

    op.create_table(
        "plate_kitchen_invites",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("kitchen_id", sa.Uuid(), sa.ForeignKey("plate_kitchens.id"), nullable=False),
        sa.Column("invited_email", sa.String(320), nullable=True),
        sa.Column("invited_user_id", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=True),
        sa.Column("invited_by", sa.Uuid(), sa.ForeignKey("profiles.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("kitchen_id", "invited_user_id", name="uq_plate_kitchen_invites"),
        sa.UniqueConstraint("kitchen_id", "invited_email", name="uq_plate_kitchen_invites_email"),
    )
    op.create_index(
        "ix_plate_kitchen_invites_kitchen_id", "plate_kitchen_invites", ["kitchen_id"]
    )
    op.create_index(
        "ix_plate_kitchen_invites_invited_user_id", "plate_kitchen_invites", ["invited_user_id"]
    )
    op.create_index(
        "ix_plate_kitchen_invites_invited_email", "plate_kitchen_invites", ["invited_email"]
    )
    op.execute(
        "INSERT INTO plate_kitchen_invites (id, kitchen_id, invited_email, invited_by, created_at)"
        " SELECT id, kitchen_id, email, invited_by, created_at FROM plate_kitchen_members"
        " WHERE status = 'invited' AND invited_by IS NOT NULL"
    )
    op.execute("DELETE FROM plate_kitchen_members WHERE status = 'invited'")

    op.drop_index("ix_plate_kitchen_members_email", table_name="plate_kitchen_members")
    with op.batch_alter_table("plate_kitchen_members") as batch:
        batch.drop_constraint("ck_plate_kitchen_members_status", type_="check")
        batch.drop_constraint("uq_plate_kitchen_members_email", type_="unique")
        batch.alter_column("joined_at", existing_type=sa.DateTime(timezone=True), nullable=False)
        batch.alter_column("color", existing_type=sa.String(9), nullable=False)
        batch.alter_column("user_id", existing_type=sa.Uuid(), nullable=False)
        batch.drop_column("created_at")
        batch.drop_column("invited_by")
        batch.drop_column("status")
        batch.drop_column("email")
