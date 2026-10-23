import type { Account, Transaction } from '@/db/types'

export interface AccountSummary {
  /** Cash-like accounts and receivables: money available or owed to you. */
  balance: number
  /** Credit cards only: limit minus amount owed (can be negative when over the limit). */
  available: number | null
}

/**
 * Assets and cash-like accounts: opening balance, plus inflows, minus outflows.
 * Liabilities: opening balance is amount owed; outflows increase it and inflows reduce it.
 */
export function summarizeAccount(account: Account, txs: Transaction[]): AccountSummary {
  let inflow = 0
  let outflow = 0
  for (const t of txs) {
    if (t.status === 'deleted') continue
    if (t.transaction_type === 'transfer') {
      if (t.account_id === account.id) outflow += t.amount_minor
      if (t.transfer_to_account_id === account.id) inflow += t.amount_minor
      continue
    }
    if (t.account_id !== account.id) continue
    if (t.transaction_type === 'expense') outflow += t.amount_minor
    else if (t.transaction_type === 'income' || t.transaction_type === 'refund')
      inflow += t.amount_minor
  }
  if (
    account.account_type === 'credit_card' ||
    account.account_type === 'loan' ||
    account.account_type === 'liability' ||
    account.account_type === 'loan_payable'
  ) {
    const owed = account.opening_balance + outflow - inflow
    return {
      balance: owed,
      available: account.credit_limit == null ? null : account.credit_limit - owed,
    }
  }
  return { balance: account.opening_balance + inflow - outflow, available: null }
}
