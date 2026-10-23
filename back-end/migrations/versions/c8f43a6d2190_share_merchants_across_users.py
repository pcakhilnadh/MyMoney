"""share merchant suggestions across users

Revision ID: c8f43a6d2190
Revises: b7e1c43d5a90
Create Date: 2026-10-23 17:17:00.000000

"""
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c8f43a6d2190"
down_revision: Union[str, Sequence[str], None] = "b7e1c43d5a90"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _normalized_name(name: str) -> str:
    return " ".join(name.split()).casefold()


def upgrade() -> None:
    op.rename_table("merchants", "merchants_user_scoped")
    op.create_table(
        "merchants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("normalized_name", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("normalized_name"),
    )

    connection = op.get_bind()
    rows = connection.execute(
        sa.text(
            "SELECT id, name, status, version, created_at, updated_at "
            "FROM merchants_user_scoped ORDER BY created_at, id"
        )
    )
    seen: set[str] = set()
    for row in rows:
        normalized = _normalized_name(row.name)
        if not normalized or normalized in seen:
            continue
        seen.add(normalized)
        connection.execute(
            sa.text(
                "INSERT INTO merchants "
                "(id, name, normalized_name, status, version, created_at, updated_at) "
                "VALUES (:id, :name, :normalized_name, :status, :version, :created_at, :updated_at)"
            ),
            {
                "id": row.id,
                "name": " ".join(row.name.split()),
                "normalized_name": normalized,
                "status": row.status,
                "version": row.version,
                "created_at": row.created_at,
                "updated_at": row.updated_at,
            },
        )
    op.drop_table("merchants_user_scoped")


def downgrade() -> None:
    op.rename_table("merchants", "merchants_shared")
    op.create_table(
        "merchants",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("user_id", sa.Uuid(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "name"),
    )
    op.create_index(op.f("ix_merchants_user_id"), "merchants", ["user_id"], unique=False)

    connection = op.get_bind()
    user_ids = connection.execute(sa.text("SELECT id FROM profiles")).scalars()
    rows = connection.execute(
        sa.text(
            "SELECT id, name, status, version, created_at, updated_at "
            "FROM merchants_shared ORDER BY created_at, id"
        )
    ).all()
    for user_id in user_ids:
        for row in rows:
            connection.execute(
                sa.text(
                    "INSERT INTO merchants "
                    "(id, user_id, name, status, version, created_at, updated_at) "
                    "VALUES (:id, :user_id, :name, :status, :version, :created_at, :updated_at)"
                ),
                {
                    "id": uuid.uuid4(),
                    "user_id": user_id,
                    "name": row.name,
                    "status": row.status,
                    "version": row.version,
                    "created_at": row.created_at,
                    "updated_at": row.updated_at,
                },
            )
    op.drop_table("merchants_shared")
