import type { Account, DuePayment, Transaction } from '@/db/types'

const DAY_MS = 86_400_000
export const DUE_ALERT_DAYS = 7

const pad = (n: number) => String(n).padStart(2, '0')
export const isoDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const hasDueDate = (account: Account) =>
  account.account_type === 'credit_card' ||
  account.account_type === 'loan' ||
  account.account_type === 'loan_payable'

/** Next date (today included) the account's payment falls due; short months use their last day. */
export function nextDueDate(day: number, today: Date): Date {
  const dueIn = (year: number, month: number) =>
    new Date(year, month, Math.min(day, new Date(year, month + 1, 0).getDate()))
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const thisMonth = dueIn(start.getFullYear(), start.getMonth())
  return thisMonth >= start ? thisMonth : dueIn(start.getFullYear(), start.getMonth() + 1)
}

export interface DueAlert {
  account: Account
  dueDate: string
  daysLeft: number
  amount: number
}

/** Unpaid dues falling within the next week, soonest first. */
export function dueAlerts(
  accounts: Account[],
  payments: DuePayment[],
  txs: Transaction[],
  today: Date,
): DueAlert[] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const alerts: DueAlert[] = []
  for (const account of accounts) {
    if (account.status !== 'active' || !hasDueDate(account) || !account.payment_due_day) continue
    const due = nextDueDate(account.payment_due_day, today)
    const daysLeft = Math.round((due.getTime() - start.getTime()) / DAY_MS)
    if (daysLeft > DUE_ALERT_DAYS) continue
    const dueDate = isoDate(due)
    const paid = payments.some(
      (p) => p.status !== 'deleted' && p.account_id === account.id && p.due_date === dueDate,
    )
    const amount = summarizeAccount(account, txs).balance
    if (!paid && amount > 0) alerts.push({ account, dueDate, daysLeft, amount })
  }
  return alerts.sort((a, b) => a.daysLeft - b.daysLeft)
}

/** Total interest recorded as paid on an account. */
export function interestPaid(accountId: string, payments: DuePayment[]): number {
  return payments
    .filter((p) => p.status !== 'deleted' && p.account_id === accountId)
    .reduce((sum, p) => sum + p.interest_minor, 0)
}

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
