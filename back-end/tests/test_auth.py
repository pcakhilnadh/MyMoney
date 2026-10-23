from fastapi.testclient import TestClient
from app.auth import _token_hash
from app.main import app
from app.models import AuthSession, Profile


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


def test_app_session_refreshes_and_extends_without_google_login(client):
    response = client.post("/auth/login", json={"credential": "alice"})
    assert response.status_code == 200
    auth = response.json()
    assert auth["user"]["email"] == "alice@gmail.com"
    assert auth["access_token"].startswith("mymoney_access_")
    assert "mymoney_refresh" not in auth
    assert "httponly" in response.headers["set-cookie"].lower()
    assert "max-age=2592000" in response.headers["set-cookie"].lower()

    original_token = auth["access_token"]
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {original_token}"}).status_code == 200

    refreshed = client.post("/auth/refresh")
    assert refreshed.status_code == 200
    new_token = refreshed.json()["access_token"]
    assert new_token != original_token
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {original_token}"}).status_code == 401
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {new_token}"}).status_code == 200

    with client.session_factory() as session:
        saved = session.query(AuthSession).one()
        assert saved.access_token_hash != _token_hash(original_token)
        assert saved.refresh_expires_at > saved.access_expires_at


def test_session_routes_work_with_vercel_api_prefix(client):
    login = client.post("/api/auth/login", json={"credential": "alice"})
    assert login.status_code == 200
    assert client.post("/api/auth/refresh").status_code == 200


def test_refresh_rejects_untrusted_browser_origins(client):
    response = client.post(
        "/auth/refresh",
        headers={"Origin": "https://untrusted.example"},
    )
    assert response.status_code == 403


def test_logout_revokes_session_and_clears_cookie(client):
    login = client.post("/auth/login", json={"credential": "alice"})
    access_token = login.json()["access_token"]

    logout = client.post("/auth/logout")
    assert logout.status_code == 204
    assert "mymoney_refresh=" in logout.headers["set-cookie"]
    assert client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"}).status_code == 401
    assert client.post("/auth/refresh").status_code == 401


def test_expired_access_token_is_rejected(client):
    import time

    login = client.post("/auth/login", json={"credential": "alice"})
    access_token = login.json()["access_token"]
    with client.session_factory() as session:
        auth_session = session.query(AuthSession).one()
        auth_session.access_expires_at = int(time.time()) - 1
        session.commit()

    response = client.get("/auth/me", headers={"Authorization": f"Bearer {access_token}"})
    assert response.status_code == 401


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
