from tests.conftest import H

CAT = "aaaaaaaa-0000-0000-0000-000000000001"
ACC = "aaaaaaaa-0000-0000-0000-000000000002"
ACC_TO = "aaaaaaaa-0000-0000-0000-000000000004"
TX = "aaaaaaaa-0000-0000-0000-000000000003"
MERCHANT = "aaaaaaaa-0000-0000-0000-000000000006"
OTHER_MERCHANT = "aaaaaaaa-0000-0000-0000-000000000007"


def payload(version=1, amount=1000, status="active"):
    return {
        "categories": [{"id": CAT, "version": 1, "name": "Food", "is_system": True}],
        "accounts": [{"id": ACC, "version": 1, "name": "Cash"}],
        "transactions": [
            {
                "id": TX,
                "version": version,
                "status": status,
                "account_id": ACC,
                "category_id": CAT,
                "title": "Tea",
                "long_description": "Chai with a colleague",
                "merchant": "Tea Shop",
                "amount_minor": amount,
                "transaction_date": "2026-10-05T10:00:00Z",
            }
        ],
    }


def test_push_then_pull_roundtrip(client):
    c = client
    r = c.post("/sync/push", json=payload(), headers=H("alice"))
    assert r.status_code == 200 and r.json()["conflicts"] == []
    pulled = c.get("/sync/pull", headers=H("alice")).json()
    assert pulled["transactions"][0]["id"] == TX
    assert pulled["transactions"][0]["title"] == "Tea"
    assert pulled["transactions"][0]["long_description"] == "Chai with a colleague"
    assert pulled["transactions"][0]["merchant"] == "Tea Shop"
    assert pulled["categories"][0]["name"] == "Food"
    assert pulled["categories"][0]["is_system"] is True
    # nothing new since server_time
    again = c.get("/sync/pull", params={"since": pulled["server_time"]}, headers=H("alice")).json()
    assert again["transactions"] == []
    # synced rows are visible through the normal API too
    assert len(c.get("/transactions", headers=H("alice")).json()) == 1


def test_push_is_idempotent_and_versioned(client):
    c = client
    c.post("/sync/push", json=payload(), headers=H("alice"))
    c.post("/sync/push", json=payload(), headers=H("alice"))
    assert len(c.get("/transactions", headers=H("alice")).json()) == 1
    c.post("/sync/push", json=payload(version=2, amount=2500), headers=H("alice"))
    assert c.get("/transactions", headers=H("alice")).json()[0]["amount_minor"] == 2500
    # stale version is reported as a conflict and does not overwrite
    r = c.post("/sync/push", json=payload(version=1, amount=1), headers=H("alice")).json()
    assert r["conflicts"] and c.get("/transactions", headers=H("alice")).json()[0]["amount_minor"] == 2500


def test_soft_delete_syncs(client):
    c = client
    c.post("/sync/push", json=payload(), headers=H("alice"))
    c.post("/sync/push", json=payload(version=2, status="deleted"), headers=H("alice"))
    assert c.get("/transactions", headers=H("alice")).json() == []
    pulled = c.get("/sync/pull", headers=H("alice")).json()
    assert pulled["transactions"][0]["status"] == "deleted"


def test_cannot_touch_other_users_records(client):
    c = client
    c.post("/sync/push", json=payload(), headers=H("alice"))
    assert c.post("/sync/push", json=payload(version=2), headers=H("bob")).status_code == 404
    assert c.get("/sync/pull", headers=H("bob")).json()["transactions"] == []


def test_rejects_foreign_references_and_group_context(client):
    c = client
    c.post("/sync/push", json=payload(), headers=H("alice"))
    bad = payload()
    bad["transactions"][0]["id"] = "aaaaaaaa-0000-0000-0000-000000000009"
    bad["categories"] = []
    bad["accounts"] = []
    assert c.post("/sync/push", json=bad, headers=H("bob")).status_code == 422
    grp = payload()
    grp["transactions"][0]["context"] = "group"
    assert c.post("/sync/push", json=grp, headers=H("alice")).status_code == 422


def test_transfer_sync_requires_and_persists_destination(client):
    body = payload()
    body["accounts"][0].update({"name": "Loan — Alex", "account_type": "loan_payable"})
    body["accounts"].append(
        {"id": ACC_TO, "version": 1, "name": "Money lent — Sam", "account_type": "money_lent"}
    )
    transaction = body["transactions"][0]
    transaction["transaction_type"] = "transfer"
    transaction["transfer_to_account_id"] = ACC_TO
    body["categories"][0].update({"name": "Other", "transaction_type": "transfer"})
    response = client.post("/sync/push", json=body, headers=H("alice"))

    assert response.status_code == 200
    pulled = client.get("/sync/pull", headers=H("alice")).json()
    assert pulled["transactions"][0]["transfer_to_account_id"] == ACC_TO
    assert {account["account_type"] for account in pulled["accounts"]} == {
        "loan_payable",
        "money_lent",
    }

    body["transactions"][0]["id"] = "aaaaaaaa-0000-0000-0000-000000000005"
    body["transactions"][0]["transfer_to_account_id"] = ACC
    assert client.post("/sync/push", json=body, headers=H("alice")).status_code == 422


def test_category_hidden_state_syncs_and_category_type_is_enforced(client):
    body = payload()
    body["categories"][0]["is_hidden"] = True
    response = client.post("/sync/push", json=body, headers=H("alice"))
    assert response.status_code == 200
    pulled = client.get("/sync/pull", headers=H("alice")).json()
    assert pulled["categories"][0]["is_hidden"] is True

    mismatched = payload()
    mismatched["transactions"][0]["id"] = "aaaaaaaa-0000-0000-0000-000000000009"
    mismatched["transactions"][0]["transaction_type"] = "income"
    assert client.post("/sync/push", json=mismatched, headers=H("alice")).status_code == 422


def test_budget_sync_validates_category_references(client):
    budget = {
        "id": "aaaaaaaa-0000-0000-0000-000000000008",
        "version": 1,
        "category_id": CAT,
        "name": "Food",
        "amount_minor": 10000,
        "period_start": "2026-10-01",
    }
    response = client.post(
        "/sync/push",
        json={"categories": payload()["categories"], "budgets": [budget]},
        headers=H("alice"),
    )

    assert response.status_code == 200
    assert client.get("/budgets", headers=H("alice")).json()[0]["category_id"] == CAT

    budget["id"] = "aaaaaaaa-0000-0000-0000-000000000010"
    budget["category_id"] = "aaaaaaaa-0000-0000-0000-000000000011"
    response = client.post("/sync/push", json={"budgets": [budget]}, headers=H("alice"))

    assert response.status_code == 422
    assert response.json()["detail"] == "Unknown category"


def test_merchants_are_shared_and_duplicate_names_resolve_to_one_record(client):
    body = {
        "merchants": [
            {
                "id": MERCHANT,
                "version": 1,
                "name": "Amazon",
            }
        ]
    }
    assert client.post("/sync/push", json=body, headers=H("alice")).status_code == 200
    assert client.get("/sync/pull", headers=H("alice")).json()["merchants"][0]["name"] == "Amazon"
    assert client.get("/sync/pull", headers=H("bob")).json()["merchants"][0]["name"] == "Amazon"

    duplicate = {
        "merchants": [
            {
                "id": OTHER_MERCHANT,
                "version": 1,
                "name": "  amazon ",
            }
        ]
    }
    response = client.post("/sync/push", json=duplicate, headers=H("bob"))
    assert response.status_code == 200
    assert response.json()["accepted"] == [
        {"entity": "merchants", "id": OTHER_MERCHANT, "canonical_id": MERCHANT}
    ]
    pulled = client.get("/sync/pull", headers=H("bob")).json()["merchants"]
    assert len(pulled) == 1
    assert pulled[0]["id"] == MERCHANT
