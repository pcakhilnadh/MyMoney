"""Add an optional food catalogue image.

Revision ID: f1a2b3c4d5e6
Revises: e4f5a6b7c8d9
"""
from alembic import op
import sqlalchemy as sa

revision = "f1a2b3c4d5e6"
down_revision = "e4f5a6b7c8d9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("food_catalog_master", sa.Column("image_data", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("food_catalog_master", "image_data")
