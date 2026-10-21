import pytest

from app.splits import SplitError, compute_shares, net_balances, simplify_debts


def test_equal_remainder():
    s = compute_shares("equal", 100, {"a": None, "b": None, "c": None})
    assert sum(s.values()) == 100 and sorted(s.values()) == [33, 33, 34]


def test_exact_must_sum():
    assert compute_shares("exact_amount", 100, {"a": 30, "b": 70}) == {"a": 30, "b": 70}
    with pytest.raises(SplitError):
        compute_shares("exact_amount", 100, {"a": 30, "b": 60})


def test_percentage():
    s = compute_shares("percentage", 1001, {"a": 50, "b": 25, "c": 25})
    assert sum(s.values()) == 1001
    with pytest.raises(SplitError):
        compute_shares("percentage", 100, {"a": 50, "b": 40})


def test_shares_and_negative():
    assert compute_shares("shares", 300, {"a": 1, "b": 2}) == {"a": 100, "b": 200}
    with pytest.raises(SplitError):
        compute_shares("shares", 300, {"a": -1, "b": 2})


def test_balances_and_settlement():
    net = net_balances([("a", 50, 100), ("b", 50, 0)], [])
    assert net == {"a": 50, "b": -50}
    net = net_balances([("a", 50, 100), ("b", 50, 0)], [("b", "a", 20)])
    assert net == {"a": 30, "b": -30}
    assert simplify_debts(net) == [("b", "a", 30)]
