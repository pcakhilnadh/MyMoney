import type { CategoryType, TransactionType } from '@/db/types'

export function categoryTypeForTransaction(type: TransactionType): CategoryType {
  return type === 'refund' ? 'expense' : type
}

export type TransferAccountRequirement = 'both' | 'source' | 'destination' | 'either'

export function transferAccountRequirement(category: string): TransferAccountRequirement {
  const normalized = category.trim().replace(/\s+/g, ' ').toLowerCase()
  if (normalized === 'self transfer' || normalized === 'savings & investments') return 'both'
  if (normalized === 'money lent' || normalized === 'loan repayment') return 'source'
  if (normalized === 'money borrow' || normalized === 'loan collection') return 'destination'
  return 'either'
}

export function transferCategoryAccountError(
  category: string,
  hasSource: boolean,
  hasDestination: boolean,
): string | null {
  const requirement = transferAccountRequirement(category)
  if (requirement === 'both' && (!hasSource || !hasDestination)) {
    return `${category} requires both a from and a to account.`
  }
  if (requirement === 'source' && (!hasSource || hasDestination)) {
    return `${category} requires a from account only.`
  }
  if (requirement === 'destination' && (hasSource || !hasDestination)) {
    return `${category} requires a to account only.`
  }
  if (requirement === 'either' && hasSource === hasDestination) {
    return 'Choose either a from account or a to account.'
  }
  return null
}
