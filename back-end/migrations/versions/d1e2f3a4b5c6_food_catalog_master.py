"""add empty food_catalog_master table

Revision ID: d1e2f3a4b5c6
Revises: bc23de45fa67
Create Date: 2026-11-09

"""
from typing import Sequence, Union

from alembic import op


revision: str = "d1e2f3a4b5c6"
down_revision: Union[str, Sequence[str], None] = "bc23de45fa67"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Must match the output dimension of the NVIDIA embedding model in use
# (e.g. nvidia/nv-embedqa-e5-v5 -> 1024).
EMBEDDING_DIM = 1024


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
    op.execute(
        f"""
        CREATE TABLE food_catalog_master (
            id text PRIMARY KEY,
            base_food_name text NOT NULL,
            aliases text,
            description text,
            category text,
            food_type text,
            calories_100g numeric,
            protein_100g numeric,
            carbs_100g numeric,
            fat_100g numeric,
            fiber_100g numeric,
            embedding vector({EMBEDDING_DIM}) DEFAULT NULL,
            embedding_text text DEFAULT NULL,
            embedding_model text DEFAULT NULL,
            created_at timestamptz NOT NULL DEFAULT now(),
            updated_at timestamptz NOT NULL DEFAULT now(),
            user_id uuid DEFAULT NULL REFERENCES profiles (id)
        )
        """
    )
    op.execute("CREATE INDEX ix_food_catalog_master_user_id ON food_catalog_master (user_id)")
    # Trigram indexes serve `%` / similarity() / ILIKE for fuzzy matches (pohe/poha).
    op.execute(
        "CREATE INDEX ix_food_catalog_master_name_trgm "
        "ON food_catalog_master USING gin (base_food_name gin_trgm_ops)"
    )
    op.execute(
        "CREATE INDEX ix_food_catalog_master_aliases_trgm "
        "ON food_catalog_master USING gin (aliases gin_trgm_ops)"
    )


def downgrade() -> None:
    op.execute("DROP TABLE food_catalog_master")
