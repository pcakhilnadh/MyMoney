LIABILITY_ACCOUNT_TYPES = {"credit_card", "loan", "liability", "loan_payable"}
RECEIVABLE_ACCOUNT_TYPES = {"asset", "money_lent"}


def transfer_category_account_error(
    category: str, source_type: str, destination_type: str
) -> str | None:
    if category == "Money Lent" and destination_type not in RECEIVABLE_ACCOUNT_TYPES:
        return "Money Lent must go to an Asset account."
    if category == "Money Borrow" and (
        source_type not in LIABILITY_ACCOUNT_TYPES
        or destination_type in LIABILITY_ACCOUNT_TYPES
    ):
        return (
            "Money Borrow must come from a Loan, Liability, or Credit Card account "
            "and go to a non-liability account."
        )
    if category == "Loan Repayment" and (
        destination_type not in LIABILITY_ACCOUNT_TYPES
        or source_type in LIABILITY_ACCOUNT_TYPES
    ):
        return (
            "Loan Repayment must go to a Loan, Liability, or Credit Card account "
            "from a non-liability account."
        )
    if category == "Loan Collection" and (
        source_type not in RECEIVABLE_ACCOUNT_TYPES
        or destination_type in RECEIVABLE_ACCOUNT_TYPES
    ):
        return "Loan Collection must come from an Asset account and go to a non-Asset account."
    return None
