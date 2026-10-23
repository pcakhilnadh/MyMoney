import type { AccountType, CategoryType, TransactionType } from '@/db/types'

export function categoryTypeForTransaction(type: TransactionType): CategoryType {
  return type === 'refund' ? 'expense' : type
}

const LIABILITY_TYPES: AccountType[] = ['credit_card', 'loan', 'liability', 'loan_payable']
const RECEIVABLE_TYPES: AccountType[] = ['asset', 'money_lent']

export function transferCategoryAccountError(
  category: string,
  sourceType: AccountType,
  destinationType: AccountType,
): string | null {
  if (category === 'Money Lent' && !RECEIVABLE_TYPES.includes(destinationType)) {
    return 'Money Lent must go to an Asset account.'
  }

  if (
    category === 'Money Borrow' &&
    (!LIABILITY_TYPES.includes(sourceType) || LIABILITY_TYPES.includes(destinationType))
  ) {
    return 'Money Borrow must come from a Loan, Liability, or Credit Card account and go to a non-liability account.'
  }
  if (
    category === 'Loan Repayment' &&
    (!LIABILITY_TYPES.includes(destinationType) || LIABILITY_TYPES.includes(sourceType))
  ) {
    return 'Loan Repayment must go to a Loan, Liability, or Credit Card account from a non-liability account.'
  }
  if (
    category === 'Loan Collection' &&
    (!RECEIVABLE_TYPES.includes(sourceType) || RECEIVABLE_TYPES.includes(destinationType))
  ) {
    return 'Loan Collection must come from an Asset account and go to a non-Asset account.'
  }
  return null
}
