import csv
import importlib
from io import StringIO
from pathlib import Path

import pytest
from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text
from sqlalchemy.exc import IntegrityError

from app.routers_food import FoodCategory, FoodType

migration = importlib.import_module("migrations.versions.e4f5a6b7c8d9_food_catalog_constraints")
image_migration = importlib.import_module("migrations.versions.f1a2b3c4d5e6_food_catalog_image")


def test_catalog_image_migration_is_reversible():
    output = StringIO()
    context = MigrationContext.configure(
        dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output}
    )
    with Operations.context(context):
        image_migration.upgrade()
        image_migration.downgrade()
    sql = output.getvalue()
    assert "ADD COLUMN image_data TEXT" in sql
    assert "DROP COLUMN image_data" in sql


def test_postgresql_migration_generates_constraints_and_reversible_nullability():
    output = StringIO()
    context = MigrationContext.configure(
        dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output}
    )
    with Operations.context(context):
        migration.upgrade()
        migration.downgrade()
    sql = output.getvalue()
    assert f"CHECK ({migration.CATEGORY_CHECK})" in sql
    assert f"CHECK ({migration.FOOD_TYPE_CHECK})" in sql
    for column in ("category", "food_type"):
        assert f"ALTER COLUMN {column} SET NOT NULL" in sql
        assert f"ALTER COLUMN {column} DROP NOT NULL" in sql
    assert "DROP CONSTRAINT ck_food_catalog_category" in sql
    assert "DROP CONSTRAINT ck_food_catalog_food_type" in sql


def test_catalog_constraint_expressions_accept_dataset_and_reject_invalid_values():
    engine = create_engine("sqlite://")
    dataset = Path(__file__).resolve().parents[1] / "food_dataset_prep" / "food_catelog_master.csv"
    with dataset.open(encoding="utf-8", newline="") as file:
        rows = list(csv.DictReader(file))
    with engine.begin() as conn:
        conn.execute(text(
            "CREATE TABLE foods (category TEXT NOT NULL, food_type TEXT NOT NULL, "
            f"CHECK ({migration.CATEGORY_CHECK}), CHECK ({migration.FOOD_TYPE_CHECK}))"
        ))
        conn.execute(
            text("INSERT INTO foods (category, food_type) VALUES (:category, :food_type)"),
            [{"category": row["category"], "food_type": row["food_type"]} for row in rows],
        )
        for category in FoodCategory:
            for food_type in FoodType:
                conn.execute(
                    text("INSERT INTO foods (category, food_type) VALUES (:category, :food_type)"),
                    {"category": category.value, "food_type": food_type.value},
                )
        for category, food_type in (
            ("invalid", "raw"), ("fruit", "invalid"), (None, "raw"), ("fruit", None),
        ):
            with pytest.raises(IntegrityError):
                conn.execute(
                    text("INSERT INTO foods (category, food_type) VALUES (:category, :food_type)"),
                    {"category": category, "food_type": food_type},
                )
