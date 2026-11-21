import importlib
from io import StringIO

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, inspect

from app.db import Base
from app.models import Profile

migration = importlib.import_module("migrations.versions.f7a8b9c0d1e2_myplate_tables")
PLATE_TABLES = sorted(t for t in Base.metadata.tables if t.startswith("plate_"))


def test_postgresql_sql_has_the_one_personal_kitchen_index_and_checks():
    output = StringIO()
    context = MigrationContext.configure(
        dialect_name="postgresql", opts={"as_sql": True, "output_buffer": output}
    )
    with Operations.context(context):
        migration.upgrade()
        migration.downgrade()
    sql = output.getvalue()
    assert "CREATE UNIQUE INDEX uq_plate_kitchens_one_personal" in sql
    assert "WHERE is_personal = true" in sql
    assert "CONSTRAINT ck_plate_meals_chef_type CHECK" in sql
    assert "ON DELETE SET NULL" in sql and "ON DELETE CASCADE" in sql
    for table in PLATE_TABLES:
        assert f"DROP TABLE {table}" in sql


def test_migration_matches_the_models_and_reverses():
    engine = create_engine("sqlite://")
    Profile.__table__.create(engine)
    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration.upgrade()

    inspector = inspect(engine)
    assert sorted(t for t in inspector.get_table_names() if t.startswith("plate_")) == PLATE_TABLES
    for table in PLATE_TABLES:
        migrated = {c["name"] for c in inspector.get_columns(table)}
        modelled = {c.name for c in Base.metadata.tables[table].columns}
        assert migrated == modelled, table

    with engine.begin() as connection:
        with Operations.context(MigrationContext.configure(connection)):
            migration.downgrade()
    assert not [t for t in inspect(engine).get_table_names() if t.startswith("plate_")]
