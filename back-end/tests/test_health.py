from sqlalchemy import create_engine
from sqlalchemy.exc import SQLAlchemyError

from app import main as main_module
from fastapi.testclient import TestClient


def test_health_when_database_is_connected(monkeypatch):
    monkeypatch.setattr(main_module, "engine", create_engine("sqlite://"))

    r = TestClient(main_module.app).get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "connected", "version": "1.2.4", "api": "v1"}


def test_health_when_database_is_unavailable(monkeypatch):
    def fail_connect():
        raise SQLAlchemyError("connection unavailable")

    monkeypatch.setattr(main_module.engine, "connect", fail_connect)

    r = TestClient(main_module.app).get("/health")
    assert r.status_code == 503
    assert r.json() == {"status": "unhealthy", "database": "disconnected"}


def test_version_reports_the_deployed_build(monkeypatch):
    monkeypatch.setenv("VERCEL_GIT_COMMIT_SHA", "abcdef1234567890")

    r = TestClient(main_module.app).get("/api/version")
    assert r.status_code == 200
    assert r.json() == {"version": "1.2.4", "api": "v1", "apis": ["v1"], "commit": "abcdef1"}


def test_version_without_a_known_commit(monkeypatch):
    monkeypatch.delenv("VERCEL_GIT_COMMIT_SHA", raising=False)
    monkeypatch.delenv("GIT_COMMIT", raising=False)

    assert TestClient(main_module.app).get("/api/version").json()["commit"] is None
