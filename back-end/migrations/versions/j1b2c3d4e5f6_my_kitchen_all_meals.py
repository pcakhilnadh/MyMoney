"""My Kitchen plans every meal

My Kitchen can no longer be edited, so every one plans breakfast, lunch, snacks and dinner.

Revision ID: j1b2c3d4e5f6
Revises: i0a1b2c3d4e5
Create Date: 2026-11-22

"""
from typing import Sequence, Union

from alembic import op


revision: str = "j1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "i0a1b2c3d4e5"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute(
        "UPDATE plate_kitchens SET meal_slots = '[\"B\", \"L\", \"S\", \"D\"]' WHERE is_personal"
        " = true"
    )


def downgrade() -> None:
    # The earlier per-kitchen choices aren't kept, so there's nothing to restore.
    pass
