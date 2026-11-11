"""constrain food catalogue categories and types

Revision ID: e4f5a6b7c8d9
Revises: d1e2f3a4b5c6
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "e4f5a6b7c8d9"
down_revision: Union[str, Sequence[str], None] = "d1e2f3a4b5c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CATEGORY_CHECK = (
    "category IN ('base_food', 'dairy', 'egg', 'fish', 'fruit', 'grain', "
    "'ingredient', 'legume', 'meat', 'nut_seed', 'seafood', 'vegetable')"
)
FOOD_TYPE_CHECK = "food_type IN ('processed', 'raw')"


def upgrade() -> None:
    op.create_check_constraint("ck_food_catalog_category", "food_catalog_master", CATEGORY_CHECK)
    op.create_check_constraint("ck_food_catalog_food_type", "food_catalog_master", FOOD_TYPE_CHECK)
    op.alter_column("food_catalog_master", "category", existing_type=sa.Text(), nullable=False)
    op.alter_column("food_catalog_master", "food_type", existing_type=sa.Text(), nullable=False)


def downgrade() -> None:
    op.alter_column("food_catalog_master", "food_type", existing_type=sa.Text(), nullable=True)
    op.alter_column("food_catalog_master", "category", existing_type=sa.Text(), nullable=True)
    op.drop_constraint("ck_food_catalog_food_type", "food_catalog_master", type_="check")
    op.drop_constraint("ck_food_catalog_category", "food_catalog_master", type_="check")
