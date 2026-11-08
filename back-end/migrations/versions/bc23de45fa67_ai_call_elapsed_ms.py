"""Add elapsed time to AI call logs.

Revision ID: bc23de45fa67
Revises: ab12cd34ef56
"""
from alembic import op
import sqlalchemy as sa

revision = "bc23de45fa67"
down_revision = "ab12cd34ef56"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("ai_call_logs", sa.Column("elapsed_ms", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("ai_call_logs", "elapsed_ms")
