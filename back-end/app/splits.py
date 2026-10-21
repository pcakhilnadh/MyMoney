"""Pure split math. All amounts are integer minor units (paise)."""

from collections.abc import Mapping


class SplitError(ValueError):
    pass


def _distribute(total: int, weights: Mapping[str, int]) -> dict[str, int]:
    """Split total proportionally to integer weights; remainder goes to the largest weights."""
    wsum = sum(weights.values())
    if wsum <= 0:
        raise SplitError("weights must be positive")
    out = {k: total * w // wsum for k, w in weights.items()}
    remainder = total - sum(out.values())
    for k in sorted(weights, key=lambda k: (-weights[k], k))[:remainder]:
        out[k] += 1
    return out


def compute_shares(
    method: str, total: int, values: Mapping[str, float | int | None]
) -> dict[str, int]:
    """values: participant -> amount_minor (exact_amount), percent (percentage),
    units (shares); ignored for equal."""
    if total <= 0:
        raise SplitError("total must be positive")
    if not values:
        raise SplitError("at least one participant required")
    if method == "equal":
        return _distribute(total, {k: 1 for k in values})
    if any(v is None or v < 0 for v in values.values()):
        raise SplitError("values must be non-negative")
    if method == "exact_amount":
        shares = {k: int(v) for k, v in values.items()}
        if sum(shares.values()) != total:
            raise SplitError("exact amounts must sum to the total")
        return shares
    if method == "percentage":
        if round(sum(values.values()), 2) != 100:
            raise SplitError("percentages must sum to 100")
        return _distribute(total, {k: round(v * 100) for k, v in values.items()})
    if method == "shares":
        return _distribute(total, {k: int(v) for k, v in values.items()})
    raise SplitError(f"unknown split method {method}")


def net_balances(
    splits: list[tuple[str, int, int]], settlements: list[tuple[str, str, int]]
) -> dict[str, int]:
    """splits: (user, share, paid). settlements: (payer, receiver, amount).
    Positive result = the user is owed money; negative = owes."""
    net: dict[str, int] = {}
    for user, share, paid in splits:
        net[user] = net.get(user, 0) + paid - share
    for payer, receiver, amount in settlements:
        net[payer] = net.get(payer, 0) + amount
        net[receiver] = net.get(receiver, 0) - amount
    return net


def simplify_debts(net: Mapping[str, int]) -> list[tuple[str, str, int]]:
    """Greedy minimal transfers: (debtor, creditor, amount)."""
    debtors = sorted([[u, -n] for u, n in net.items() if n < 0], key=lambda x: -x[1])
    creditors = sorted([[u, n] for u, n in net.items() if n > 0], key=lambda x: -x[1])
    out: list[tuple[str, str, int]] = []
    i = j = 0
    while i < len(debtors) and j < len(creditors):
        amt = min(debtors[i][1], creditors[j][1])
        out.append((debtors[i][0], creditors[j][0], amt))
        debtors[i][1] -= amt
        creditors[j][1] -= amt
        if debtors[i][1] == 0:
            i += 1
        if creditors[j][1] == 0:
            j += 1
    return out
