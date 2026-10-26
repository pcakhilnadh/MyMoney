def transfer_account_requirement(category: str) -> str:
    normalized = " ".join(category.split()).casefold()
    if normalized in {"self transfer", "savings & investments"}:
        return "both"
    if normalized in {"money lent", "loan repayment"}:
        return "source"
    if normalized in {"money borrow", "loan collection"}:
        return "destination"
    return "either"


def transfer_category_account_error(
    category: str, has_source: bool, has_destination: bool
) -> str | None:
    requirement = transfer_account_requirement(category)
    if requirement == "both" and (not has_source or not has_destination):
        return f"{category} requires both a from and a to account"
    if requirement == "source" and (not has_source or has_destination):
        return f"{category} requires a from account only"
    if requirement == "destination" and (has_source or not has_destination):
        return f"{category} requires a to account only"
    if requirement == "either" and has_source == has_destination:
        return "Choose either a from account or a to account"
    return None
