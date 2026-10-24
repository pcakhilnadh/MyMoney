from uuid import UUID

from app.models import Category, ExpenseGroup, GroupMember
from tests.conftest import H


def me(c, u):
    return c.get("/auth/me", headers=H(u)).json()["id"]


def tx(**kw):
    return {
        "title": "Dinner",
        "amount_minor": 30000,
        "transaction_date": "2026-10-05T12:00:00Z",
        **kw,
    }


def make_account(c, user="alice"):
    response = c.post("/accounts", json={"name": "Everyday"}, headers=H(user))
    assert response.status_code == 201
    return response.json()["id"]


def make_group(c):
    a, b = me(c, "alice"), me(c, "bob")
    g = c.post("/groups", json={"name": "Trip"}, headers=H("alice")).json()
    assert c.post(f"/groups/{g['id']}/members", json={"email": "Bob@gmail.com"}, headers=H("alice")).status_code == 201
    return g["id"], a, b


def test_category_creation_returns_existing_user_or_default_category(client):
    c = client
    first = c.post(
        "/categories",
        json={"name": "Custom food", "transaction_type": "expense"},
        headers=H("alice"),
    )
    duplicate = c.post(
        "/categories",
        json={"name": "  CUSTOM   FOOD ", "transaction_type": "expense"},
        headers=H("alice"),
    )

    assert first.status_code == 201
    assert duplicate.status_code == 200
    assert duplicate.json()["id"] == first.json()["id"]

    default_id = UUID("aaaaaaaa-0000-0000-0000-000000000010")
    with c.session_factory() as db:
        db.add(
            Category(
                id=default_id,
                user_id=None,
                name="Groceries",
                transaction_type="expense",
                is_system=True,
            )
        )
        db.commit()
    default_duplicate = c.post(
        "/categories",
        json={"name": "groceries", "transaction_type": "expense"},
        headers=H("alice"),
    )

    assert default_duplicate.status_code == 200
    assert default_duplicate.json()["id"] == str(default_id)


def test_personal_private_and_idempotent(client):
    c = client
    body = tx(
        account_id=make_account(c),
        client_id="11111111-1111-1111-1111-111111111111",
        long_description="Dinner with friends",
        merchant="Example Restaurant",
    )
    r1 = c.post("/transactions", json=body, headers=H("alice"))
    r2 = c.post("/transactions", json=body, headers=H("alice"))
    assert r1.status_code == 201 and r1.json()["id"] == r2.json()["id"]
    assert r1.json()["title"] == "Dinner"
    assert r1.json()["long_description"] == "Dinner with friends"
    assert r1.json()["merchant"] == "Example Restaurant"
    assert len(c.get("/transactions", headers=H("alice")).json()) == 1
    assert c.get("/transactions", headers=H("bob")).json() == []
    assert c.delete(f"/transactions/{r1.json()['id']}", headers=H("bob")).status_code == 404


def test_transaction_long_description_and_merchant_are_optional(client):
    response = client.post(
        "/transactions",
        json=tx(account_id=make_account(client)),
        headers=H("alice"),
    )
    assert response.status_code == 201
    assert response.json()["title"] == "Dinner"
    assert response.json()["long_description"] is None
    assert response.json()["merchant"] is None


def test_transaction_amount_uses_minor_units_for_two_decimal_precision(client):
    response = client.post(
        "/transactions",
        json=tx(account_id=make_account(client), amount_minor=1234),
        headers=H("alice"),
    )

    assert response.status_code == 201
    assert response.json()["amount_minor"] == 1234
    assert client.get("/transactions", headers=H("alice")).json()[0]["amount_minor"] == 1234


def test_personal_transaction_requires_owned_active_account(client):
    me(client, "alice")
    missing = client.post("/transactions", json=tx(), headers=H("alice"))
    assert missing.status_code == 422

    account_id = make_account(client, "bob")
    foreign = client.post(
        "/transactions", json=tx(account_id=account_id), headers=H("alice")
    )
    assert foreign.status_code == 422


def test_transfer_requires_two_different_owned_accounts(client):
    source = make_account(client)
    destination = make_account(client)
    response = client.post(
        "/transactions",
        json=tx(
            account_id=source,
            transfer_to_account_id=destination,
            transaction_type="transfer",
        ),
        headers=H("alice"),
    )
    assert response.status_code == 201
    assert response.json()["transfer_to_account_id"] == destination

    same_account = client.post(
        "/transactions",
        json=tx(
            account_id=source,
            transfer_to_account_id=source,
            transaction_type="transfer",
        ),
        headers=H("alice"),
    )
    assert same_account.status_code == 422

    foreign_destination = make_account(client, "bob")
    foreign = client.post(
        "/transactions",
        json=tx(
            account_id=source,
            transfer_to_account_id=foreign_destination,
            transaction_type="transfer",
        ),
        headers=H("alice"),
    )
    assert foreign.status_code == 422


def test_personal_rejects_group_fields(client):
    me(client, "alice")
    r = client.post(
        "/transactions",
        json=tx(account_id=make_account(client), splits=[{"user_id": me(client, "alice")}]),
        headers=H("alice"),
    )
    assert r.status_code == 422


def test_group_flow_split_balance_settle(client):
    c = client
    gid, a, b = make_group(c)
    account_id = make_account(c)
    # invited but not yet active: cannot see group
    assert c.get(f"/groups/{gid}/members", headers=H("bob")).status_code == 404
    assert [g["id"] for g in c.get("/groups/invitations", headers=H("bob")).json()] == [gid]
    m = c.post(f"/groups/{gid}/join", headers=H("bob")).json()
    assert m["status"] == "active" and m["display_name"] == "Bob"

    r = c.post(
        "/transactions",
        json=tx(account_id=account_id, context="group", group_id=gid, split_method="equal", splits=[{"user_id": a}, {"user_id": b}]),
        headers=H("alice"),
    )
    assert r.status_code == 201 and r.json()["is_shared"]
    # bob sees the shared expense
    assert len(c.get("/transactions", headers=H("bob")).json()) == 1
    bal = c.get(f"/groups/{gid}/balances", headers=H("bob")).json()
    assert bal["net"] == {a: 15000, b: -15000}
    assert bal["transfers"] == [{"from": b, "to": a, "amount_minor": 15000}]

    s = c.post("/settlements", json={"group_id": gid, "receiver_user_id": a, "amount_minor": 5000}, headers=H("bob"))
    assert s.status_code == 201
    bal = c.get(f"/groups/{gid}/balances", headers=H("alice")).json()
    assert bal["net"][a] == 10000

    summ = c.get("/insights/summary", params={"year": 2026, "month": 10}, headers=H("bob")).json()
    assert summ["total_minor"] == 15000


def test_only_owner_can_delete_group(client):
    c = client
    gid, _, _ = make_group(c)
    c.post(f"/groups/{gid}/join", headers=H("bob"))
    assert c.delete(f"/groups/{gid}", headers=H("bob")).status_code == 403
    response = c.delete(f"/groups/{gid}", headers=H("alice"))
    assert response.status_code == 204
    assert c.get("/groups", headers=H("alice")).json() == []
    assert c.get("/groups", headers=H("bob")).json() == []
    assert c.get(f"/groups/{gid}/members", headers=H("bob")).status_code == 404
    with c.session_factory() as db:
        group_id = UUID(gid)
        assert db.get(ExpenseGroup, group_id).status == "inactive"
        assert {m.status for m in db.query(GroupMember).filter_by(group_id=group_id)} == {
            "inactive"
        }


def test_member_can_leave_and_owner_can_reinvite(client):
    c = client
    gid, _, _ = make_group(c)
    c.post(f"/groups/{gid}/join", headers=H("bob"))

    assert c.delete(f"/groups/{gid}/members/me", headers=H("alice")).status_code == 403
    assert c.delete(f"/groups/{gid}/members/me", headers=H("bob")).status_code == 204
    assert c.get("/groups", headers=H("bob")).json() == []
    assert c.get(f"/groups/{gid}/members", headers=H("bob")).status_code == 404

    members = c.get(f"/groups/{gid}/members", headers=H("alice")).json()
    bob = next(member for member in members if member["email"] == "bob@gmail.com")
    assert bob["status"] == "inactive"

    reinvite = c.post(
        f"/groups/{gid}/members",
        json={"email": "Bob@gmail.com"},
        headers=H("alice"),
    )
    assert reinvite.status_code == 201
    assert reinvite.json()["id"] == bob["id"]
    assert reinvite.json()["status"] == "invited"
    assert c.post(f"/groups/{gid}/join", headers=H("bob")).json()["status"] == "active"
    assert [group["id"] for group in c.get("/groups", headers=H("bob")).json()] == [gid]


def test_split_validation_and_outsiders(client):
    c = client
    gid, a, b = make_group(c)
    account_id = make_account(c)
    c.post(f"/groups/{gid}/join", headers=H("bob"))
    carol = me(c, "carol")
    bad = tx(account_id=account_id, context="group", group_id=gid, split_method="exact_amount",
             splits=[{"user_id": a, "value": 1}, {"user_id": b, "value": 2}])
    assert c.post("/transactions", json=bad, headers=H("alice")).status_code == 422
    outsider = tx(account_id=account_id, context="group", group_id=gid, splits=[{"user_id": carol}])
    assert c.post("/transactions", json=outsider, headers=H("alice")).status_code == 422
    # carol cannot post into or read the group
    assert c.post("/transactions", json=tx(account_id=account_id, context="group", group_id=gid), headers=H("carol")).status_code == 404
    assert c.get(f"/groups/{gid}/balances", headers=H("carol")).status_code == 404


def test_only_admin_invites_and_no_self_settlement(client):
    c = client
    gid, a, b = make_group(c)
    c.post(f"/groups/{gid}/join", headers=H("bob"))
    r = c.post(f"/groups/{gid}/members", json={"email": "x@gmail.com"}, headers=H("bob"))
    assert r.status_code == 403
    assert c.post("/settlements", json={"receiver_user_id": a, "amount_minor": 1}, headers=H("alice")).status_code == 422


def test_budget_and_accounts(client):
    c = client
    r = c.post("/budgets", json={"name": "Food", "amount_minor": 500000, "period_start": "2026-10-01"}, headers=H("alice"))
    assert r.status_code == 201
    assert len(c.get("/budgets", headers=H("alice")).json()) == 1
    assert c.get("/budgets", headers=H("bob")).json() == []
    assert c.post("/accounts", json={"name": "HDFC", "account_type": "bank"}, headers=H("alice")).status_code == 201


def test_invite_sends_email_and_account_limits(client, monkeypatch):
    from app import routers

    sent = []
    monkeypatch.setattr(routers, "send_email", lambda to, subj, body: sent.append((to, subj, body)))
    c = client
    g = c.post("/groups", json={"name": "Flat"}, headers=H("alice")).json()
    r = c.post(f"/groups/{g['id']}/members", json={"email": "Bob@Gmail.com"}, headers=H("alice"))
    assert r.status_code == 201
    assert sent and sent[0][0] == "bob@gmail.com" and "Flat" in sent[0][1]
    # failed delivery never fails the invite
    monkeypatch.setattr(routers, "send_email", lambda *a: False)
    assert c.post(f"/groups/{g['id']}/members", json={"email": "x@gmail.com"}, headers=H("alice")).status_code == 201

    acc = c.post(
        "/accounts",
        json={"name": "Visa", "account_type": "credit_card", "credit_limit": 100000, "opening_balance": 2500},
        headers=H("alice"),
    ).json()
    assert acc["credit_limit"] == 100000 and acc["opening_balance"] == 2500
