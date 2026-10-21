from fastapi.testclient import TestClient
from app.main import app
from app.models import Profile


def test_requires_token(client):
    c = client
    assert c.get("/auth/me").status_code == 401


def test_vercel_api_prefix_requires_token(client):
    assert client.get("/api/auth/me").status_code == 401


def test_creates_profile_once(client):
    c, Session = client, client.session_factory
    h = {"Authorization": "Bearer alice"}
    first = c.get("/auth/me", headers=h).json()
    second = c.get("/auth/me", headers=h).json()
    assert first == second and first["email"] == "alice@gmail.com"
    with Session() as s:
        assert s.query(Profile).count() == 1


def test_invalid_token_rejected(monkeypatch):
    from google.oauth2 import id_token

    def boom(*a, **k):
        raise ValueError("bad")

    monkeypatch.setattr(id_token, "verify_oauth2_token", boom)
    r = TestClient(app).get("/auth/me", headers={"Authorization": "Bearer junk"})
    assert r.status_code == 401


def test_concurrent_first_requests_do_not_500(client, monkeypatch):
    """Simulate losing the insert race: the first lookup misses, the insert collides."""
    from sqlalchemy.orm import Session

    c = client
    c.get("/auth/me", headers={"Authorization": "Bearer dana"})  # row now exists
    real_scalar = Session.scalar
    calls = {"n": 0}

    def flaky(self, stmt, *a, **k):
        calls["n"] += 1
        return None if calls["n"] == 1 else real_scalar(self, stmt, *a, **k)

    monkeypatch.setattr(Session, "scalar", flaky)
    assert c.get("/auth/me", headers={"Authorization": "Bearer dana"}).status_code == 200
