const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' })

/** Format an amount in minor units (paise) as INR. */
export const formatMinor = (minor: number) => inr.format(minor / 100)

export const DEFAULT_CATEGORIES = {
  expense: [
    'Food & Dining',
    'Shopping',
    'Entertainment & Recreation',
    'Subscriptions',
    'Health & Wellness',
    'Transportation',
    'Travel & Trips',
    'Housing',
    'Bills & Utilities',
    'Repair & Maintenance',
    'Loans & EMIs',
    'Education & Development',
    'Donations & Gifts',
    'Insurance & Financial Charges',
    'Miscellaneous',
  ],
  income: [
    'Salary',
    'Investment Income',
    'Profits & Interests',
    'Gifts',
    'Refund & Reimbursements',
    'Business Income',
    'Rental Income',
    'Pension & Benefits',
    'Other',
  ],
  transfer: [
    'Self Transfer',
    'Savings & Investments',
    'Money Lent',
    'Money Borrow',
    'Loan Repayment',
    'Loan Collection',
    'Other',
  ],
} as const

export const LEGACY_EXPENSE_CATEGORY_NAMES: Record<string, string> = {
  Food: 'Food & Dining',
  Travel: 'Travel & Trips',
  Home: 'Housing',
  Bills: 'Bills & Utilities',
  Transport: 'Transportation',
  Health: 'Health & Wellness',
  Entertainment: 'Entertainment & Recreation',
  Other: 'Miscellaneous',
}

/** Parse a user-entered rupee string into minor units; NaN-safe (returns 0). */
export function toMinor(input: string): number {
  const n = Number(input.replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}
