"""MyPlate: invite to a kitchen by email

Invites used to name a user found through money groups. They now carry an email address,
matched when that person signs in, so the user column becomes optional.

Revision ID: h9c0d1e2f3a4
Revises: g8b9c0d1e2f3
Create Date: 2026-11-22

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "h9c0d1e2f3a4"
down_revision: Union[str, Sequence[str], None] = "g8b9c0d1e2f3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("plate_kitchen_invites") as batch:
        batch.add_column(sa.Column("invited_email", sa.String(320), nullable=True))
        batch.alter_column("invited_user_id", existing_type=sa.Uuid(), nullable=True)
        batch.create_unique_constraint(
            "uq_plate_kitchen_invites_email", ["kitchen_id", "invited_email"]
        )
    op.create_index(
        "ix_plate_kitchen_invites_invited_email", "plate_kitchen_invites", ["invited_email"]
    )


def downgrade() -> None:
    op.drop_index("ix_plate_kitchen_invites_invited_email", table_name="plate_kitchen_invites")
    # Email-only invites have no user to keep.
    op.execute("DELETE FROM plate_kitchen_invites WHERE invited_user_id IS NULL")
    with op.batch_alter_table("plate_kitchen_invites") as batch:
        batch.drop_constraint("uq_plate_kitchen_invites_email", type_="unique")
        batch.alter_column("invited_user_id", existing_type=sa.Uuid(), nullable=False)
        batch.drop_column("invited_email")
