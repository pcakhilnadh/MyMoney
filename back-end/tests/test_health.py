from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError

from app import main as main_module
from fastapi.testclient import TestClient


def test_health_when_database_is_connected(monkeypatch):
    monkeypatch.setattr(main_module, "engine", create_engine("sqlite://"))

    r = TestClient(main_module.app).get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "connected"}


def test_health_when_database_is_unavailable(monkeypatch):
    def fail_connect():
        raise SQLAlchemyError("connection unavailable")

    monkeypatch.setattr(main_module.engine, "connect", fail_connect)

    r = TestClient(main_module.app).get("/health")
    assert r.status_code == 503
    assert r.json() == {"status": "unhealthy", "database": "disconnected"}
