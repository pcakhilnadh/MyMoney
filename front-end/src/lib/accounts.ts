import type { Account, Transaction } from '@/db/types'

export interface AccountSummary {
  /** Cash-like accounts: money available. Credit cards: amount currently owed. */
  balance: number
  /** Credit cards only: limit minus amount owed (can be negative when over the limit). */
  available: number | null
}

/**
 * Cash-like: opening balance, plus income/refunds, minus expenses.
 * Credit card: `opening_balance` is the amount already owed when tracking began; expenses add to
 * what is owed, refunds/income reduce it.
 */
export function summarizeAccount(account: Account, txs: Transaction[]): AccountSummary {
  let inflow = 0
  let outflow = 0
  for (const t of txs) {
    if (t.account_id !== account.id || t.status === 'deleted') continue
    if (t.transaction_type === 'expense') outflow += t.amount_minor
    else if (t.transaction_type === 'income' || t.transaction_type === 'refund')
      inflow += t.amount_minor
  }
  if (account.account_type === 'credit_card') {
    const owed = account.opening_balance + outflow - inflow
    return {
      balance: owed,
      available: account.credit_limit == null ? null : account.credit_limit - owed,
    }
  }
  return { balance: account.opening_balance + inflow - outflow, available: null }
}
