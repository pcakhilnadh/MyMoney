import importlib
from io import StringIO

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect

from app.db import Base
from app.models import Profile

tables = importlib.import_module("migrations.versions.f7a8b9c0d1e2_myplate_tables")
sync = importlib.import_module("migrations.versions.g8b9c0d1e2f3_plate_sync")
PLATE_TABLES = sorted(t for t in Base.metadata.tables if t.startswith("plate_"))


def test_postgresql_sql_has_the_one_personal_kitchen_index_and_checks():
    output = StringIO()
    context = MigrationContext.configure(
        dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output}
    )
    with Operations.context(context):
        tables.upgrade()
        sync.upgrade()
        sync.downgrade()
        tables.downgrade()
    sql = output.getvalue()
    assert "CREATE UNIQUE INDEX uq_plate_kitchens_one_personal" in sql
    assert "WHERE is_personal = true" in sql
    assert "CONSTRAINT ck_plate_meals_chef_type CHECK" in sql
    assert "ON DELETE SET NULL" in sql and "ON DELETE CASCADE" in sql
    assert "UPDATE plate_ideas SET updated_at = created_at" in sql
    assert "CREATE INDEX ix_plate_meals_kitchen_updated" in sql
    for table in PLATE_TABLES:
        assert f"DROP TABLE {table}" in sql


def test_migrations_match_the_models_and_reverse():
    engine = create_engine("sqlite://")
    Profile.__table__.create(engine)

    def run(*steps):
        with engine.begin() as connection:
            with Operations.context(MigrationContext.configure(connection)):
                for step in steps:
                    step()

    run(tables.upgrade)
    # A cart item saved before sync existed gets its creation time as its change time.
    with engine.begin() as connection:
        connection.exec_driver_sql(
            "INSERT INTO profiles (id, google_sub, email, plan, role, created_at)"
            " VALUES ('p1', 's', 'a@b.c', 'free', 'member', '2026-11-01')"
        )
        connection.exec_driver_sql(
            "INSERT INTO plate_kitchens (id, name, emoji, group_type, is_personal, owner_id,"
            " color, meal_slots, timezone, created_at, updated_at) VALUES ('k1', 'K', 'x',"
            " 'personal', 1, 'p1', '#fff', '[]', 'UTC', '2026-11-01', '2026-11-01')"
        )
        connection.exec_driver_sql(
            "INSERT INTO plate_grocery_items (id, kitchen_id, name, quantity, aisle, added_by,"
            " created_at) VALUES ('g1', 'k1', 'Milk', '', 'Other', 'p1', '2026-11-02')"
        )
    run(sync.upgrade)
    with engine.connect() as connection:
        assert connection.exec_driver_sql(
            "SELECT updated_at FROM plate_grocery_items"
        ).scalar_one().startswith("2026-11-02")

    inspector = inspect(engine)
    assert sorted(t for t in inspector.get_table_names() if t.startswith("plate_")) == PLATE_TABLES
    for table in PLATE_TABLES:
        migrated = {c["name"] for c in inspector.get_columns(table)}
        modelled = {c.name for c in Base.metadata.tables[table].columns}
        assert migrated == modelled, table
        migrated_indexes = {i["name"] for i in inspector.get_indexes(table)}
        modelled_indexes = {i.name for i in Base.metadata.tables[table].indexes}
        assert modelled_indexes <= migrated_indexes, table

    run(sync.downgrade)
    assert "updated_at" not in {c["name"] for c in inspect(engine).get_columns("plate_ideas")}
    run(tables.downgrade)
    assert not [t for t in inspect(engine).get_table_names() if t.startswith("plate_")]
