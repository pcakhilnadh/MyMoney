from app.models import AppRole, Profile
from tests.conftest import H


def set_role(c, user, role):
    c.get("/api/v1/auth/me", headers=H(user))
    with c.session_factory() as s:
        p = s.query(Profile).filter_by(email=f"{user}@gmail.com").one()
        p.role = role
        s.commit()
        return str(p.id)


def test_member_only_gets_money(client):
    c = client
    me = c.get("/api/v1/auth/me", headers=H("alice")).json()
    assert me["entitlements"] == ["money"]
    assert c.get("/api/v1/food/entries", headers=H("alice")).status_code == 403


def test_admin_and_owner_get_everything(client):
    c = client
    set_role(c, "bob", AppRole.ADMIN)
    set_role(c, "carol", AppRole.OWNER)
    for u in ("bob", "carol"):
        assert c.get("/api/v1/auth/me", headers=H(u)).json()["entitlements"] == ["money", "food", "plate"]


def test_owner_manages_members(client):
    c = client
    set_role(c, "owner", AppRole.OWNER)
    bob = set_role(c, "bob", AppRole.MEMBER)
    rows = c.get("/api/v1/admin/members", headers=H("owner")).json()
    assert {r["email"] for r in rows} == {"owner@gmail.com", "bob@gmail.com"}
    r = c.put(f"/api/v1/admin/members/{bob}/role", json={"role": "admin"}, headers=H("owner"))
    assert r.status_code == 200 and r.json()["role"] == "admin"
    assert c.put(f"/api/v1/admin/members/{bob}/role", json={"role": "owner"}, headers=H("owner")).status_code == 422


def test_non_owner_blocked_and_owner_protected(client):
    c = client
    owner = set_role(c, "owner", AppRole.OWNER)
    set_role(c, "bob", AppRole.ADMIN)
    assert c.get("/api/v1/admin/members", headers=H("bob")).status_code == 403
    assert c.put(f"/api/v1/admin/members/{owner}/role", json={"role": "member"}, headers=H("bob")).status_code == 403
    assert c.put(f"/api/v1/admin/members/{owner}/role", json={"role": "member"}, headers=H("owner")).status_code == 409
