from tests.conftest import H


def post(c, user, body, kind="feedback"):
    return c.post("/api/v1/feedback", json={"kind": kind, "body": body}, headers=H(user))


def test_posts_show_first_name_only_and_ownership(client):
    c = client
    assert post(c, "alice", "Love it", "testimony").status_code == 201
    feed = c.get("/api/v1/feedback", headers=H("bob")).json()
    assert feed[0]["first_name"] == "Alice"
    assert feed[0]["is_mine"] is False
    assert "email" not in feed[0]
    assert c.get("/api/v1/feedback", headers=H("alice")).json()[0]["is_mine"] is True


def test_body_limits(client):
    c = client
    assert post(c, "alice", "x" * 500).status_code == 201
    assert post(c, "alice", "x" * 501).status_code == 422
    assert post(c, "alice", "   ").status_code == 422
    assert post(c, "alice", "hi", "spam").status_code == 422


def test_only_last_ten_oldest_first(client):
    c = client
    for i in range(12):
        assert post(c, "alice", f"m{i}").status_code == 201
    feed = c.get("/api/v1/feedback", headers=H("alice")).json()
    assert [m["body"] for m in feed] == [f"m{i}" for i in range(2, 12)]
