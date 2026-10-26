import type { CurrencyCode } from './currency'

function formatter(currency: CurrencyCode): Intl.NumberFormat {
  return new Intl.NumberFormat(currency === 'INR' ? 'en-IN' : 'en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

/** Format minor units using the selected currency, defaulting to INR. */
export const formatMinor = (minor: number, currency: CurrencyCode = 'INR') =>
  formatter(currency).format(minor / 100)

/** Compact INR with K/L/Cr and other supported currencies with K/M/B. */
export function formatCompactMinor(minor: number, currency: CurrencyCode = 'INR'): string {
  const amount = Math.abs(minor) / 100
  const units =
    currency === 'INR'
      ? [
          { threshold: 10_000_000, suffix: 'Cr' },
          { threshold: 100_000, suffix: 'L' },
          { threshold: 1_000, suffix: 'K' },
        ]
      : [
          { threshold: 1_000_000_000, suffix: 'B' },
          { threshold: 1_000_000, suffix: 'M' },
          { threshold: 1_000, suffix: 'K' },
        ]
  const unit = units.find(({ threshold }) => amount >= threshold)
  return formatter(currency).format(minor / 100 / (unit?.threshold ?? 1)) + (unit?.suffix ?? '')
}

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
    'Pocket Money',
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

/** Parse a user-entered amount into minor units; NaN-safe (returns 0). */
export function toMinor(input: string): number {
  const n = Number(normalizeMoneyInput(input))
  return Number.isFinite(n) ? Math.round(n * 100) : 0
}

/** Keep a money input editable while restricting it to two fractional digits. */
export function normalizeMoneyInput(input: string): string {
  const cleaned = input.replace(/[^\d.]/g, '')
  const decimal = cleaned.indexOf('.')
  if (decimal === -1) return cleaned
  return `${cleaned.slice(0, decimal)}.${cleaned
    .slice(decimal + 1)
    .replace(/\./g, '')
    .slice(0, 2)}`
}
