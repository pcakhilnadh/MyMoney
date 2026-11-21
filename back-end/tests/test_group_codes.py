"""Money groups and kitchens let people in the same ways: an email invite, or a join code."""

from tests.conftest import H

API = "/api/v1/money/groups"


def group(c, name="Trip"):
    return c.post(API, json={"name": name}, headers=H("alice")).json()["id"]


def code_for(c, gid, user="alice"):
    return c.post(f"{API}/{gid}/invite-code", headers=H(user))


def join(c, user, code):
    return c.post(f"{API}/join-with-code", json={"code": code}, headers=H(user))


def members(c, gid):
    rows = c.get(f"{API}/{gid}/members", headers=H("alice")).json()
    return {(m["email"], m["status"]) for m in rows}


def test_group_code_is_six_case_sensitive_characters_and_never_changes(client):
    gid = group(client)
    code = code_for(client, gid).json()["code"]
    assert len(code) == 6 and code.isalnum() and code.isascii()
    assert code_for(client, gid).json()["code"] == code
    if code.swapcase() != code:
        assert join(client, "bob", code.swapcase()).status_code == 404


def test_only_admins_get_the_code(client):
    gid = group(client)
    assert code_for(client, gid, "bob").status_code == 404  # not a member
    client.post(f"{API}/{gid}/members", json={"email": "bob@gmail.com"}, headers=H("alice"))
    client.post(f"{API}/{gid}/join", headers=H("bob"))
    assert code_for(client, gid, "bob").status_code == 403


def test_invited_or_not_the_code_gets_people_in(client):
    gid = group(client)
    code = code_for(client, gid).json()["code"]
    client.post(f"{API}/{gid}/members", json={"email": "Bob@gmail.com"}, headers=H("alice"))

    # Bob was invited but uses the code; his invite becomes his membership.
    assert join(client, "bob", code).json()["id"] == gid
    assert client.get(f"{API}/invitations", headers=H("bob")).json() == []
    # Carol was never invited.
    assert join(client, "carol", code).status_code == 200
    assert members(client, gid) == {
        ("alice@gmail.com", "active"),
        ("bob@gmail.com", "active"),
        ("carol@gmail.com", "active"),
    }
    # Joining again, or after leaving, works the same way.
    assert join(client, "carol", code).status_code == 200
    assert client.delete(f"{API}/{gid}/members/me", headers=H("carol")).status_code == 204
    assert join(client, "carol", code).status_code == 200
    assert ("carol@gmail.com", "active") in members(client, gid)
    assert [g["id"] for g in client.get(API, headers=H("carol")).json()] == [gid]


def test_unknown_codes_and_deleted_groups_are_refused(client):
    assert join(client, "bob", "NOPE12").status_code == 404
    gid = group(client)
    code = code_for(client, gid).json()["code"]
    assert client.delete(f"{API}/{gid}", headers=H("alice")).status_code == 204
    assert join(client, "bob", code).status_code == 404


def test_group_invites_still_refuse_repeats(client):
    gid = group(client)
    invite = lambda: client.post(  # noqa: E731
        f"{API}/{gid}/members", json={"email": "bob@gmail.com"}, headers=H("alice")
    )
    assert invite().status_code == 201
    assert invite().status_code == 409
    assert client.post(
        f"{API}/{gid}/members", json={"email": "not-an-email"}, headers=H("alice")
    ).status_code == 422
