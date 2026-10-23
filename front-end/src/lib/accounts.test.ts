import { describe, expect, it } from 'vitest'
import type { Account, Transaction } from '@/db/types'
import { summarizeAccount } from './accounts'

const acc = (o: Partial<Account>) =>
  ({ id: 'a', account_type: 'bank', opening_balance: 0, credit_limit: null, ...o }) as Account
const tx = (amount: number, type = 'expense', account = 'a') =>
  ({
    account_id: account,
    amount_minor: amount,
    transaction_type: type,
    status: 'active',
  }) as Transaction

describe('summarizeAccount', () => {
  it('starts from the opening balance', () => {
    const s = summarizeAccount(acc({ opening_balance: 10000 }), [
      tx(2500),
      tx(500, 'income'),
      tx(999, 'expense', 'other'),
    ])
    expect(s).toEqual({ balance: 8000, available: null })
  })
  it('tracks credit card usage against the limit', () => {
    const card = acc({ account_type: 'credit_card', credit_limit: 100000, opening_balance: 20000 })
    expect(summarizeAccount(card, [tx(30000), tx(5000, 'refund')])).toEqual({
      balance: 45000,
      available: 55000,
    })
  })
  it('handles a card with no limit set', () => {
    expect(summarizeAccount(acc({ account_type: 'credit_card' }), [tx(100)]).available).toBeNull()
  })
  it('moves a transfer between accounts without changing total funds', () => {
    const checking = acc({ id: 'checking', opening_balance: 5000 })
    const savings = acc({ id: 'savings', opening_balance: 2000 })
    const transfer = {
      ...tx(1200, 'transfer', 'checking'),
      transfer_to_account_id: 'savings',
    } as Transaction

    expect(summarizeAccount(checking, [transfer]).balance).toBe(3800)
    expect(summarizeAccount(savings, [transfer]).balance).toBe(3200)
  })

  it('tracks borrowed balances as liabilities and reduces them on repayment', () => {
    const loan = acc({ id: 'loan', account_type: 'loan', opening_balance: 10000 })
    const received = {
      ...tx(5000, 'transfer', 'loan'),
      transfer_to_account_id: 'checking',
    } as Transaction
    const repayment = {
      ...tx(2000, 'transfer', 'checking'),
      transfer_to_account_id: 'loan',
    } as Transaction

    expect(summarizeAccount(loan, [received, repayment]).balance).toBe(13000)
  })

  it('tracks liability accounts and legacy loan accounts as amounts owed', () => {
    const received = {
      ...tx(5000, 'transfer', 'liability'),
      transfer_to_account_id: 'checking',
    } as Transaction
    const liability = acc({ id: 'liability', account_type: 'liability' })
    const legacyLoan = acc({ id: 'legacy-loan', account_type: 'loan_payable' })
    const legacyReceived = {
      ...tx(5000, 'transfer', 'legacy-loan'),
      transfer_to_account_id: 'checking',
    } as Transaction

    expect(summarizeAccount(liability, [received]).balance).toBe(5000)
    expect(summarizeAccount(legacyLoan, [legacyReceived]).balance).toBe(5000)
  })

  it('tracks money lent as a receivable and reduces it on repayment', () => {
    const lent = acc({ id: 'lent', account_type: 'asset', opening_balance: 0 })
    const loan = {
      ...tx(5000, 'transfer', 'checking'),
      transfer_to_account_id: 'lent',
    } as Transaction
    const repayment = {
      ...tx(2000, 'transfer', 'lent'),
      transfer_to_account_id: 'checking',
    } as Transaction

    expect(summarizeAccount(lent, [loan, repayment]).balance).toBe(3000)
  })

  it('keeps legacy money-lent accounts as receivables', () => {
    const legacyAsset = acc({ id: 'legacy-asset', account_type: 'money_lent' })
    const lent = {
      ...tx(5000, 'transfer', 'checking'),
      transfer_to_account_id: 'legacy-asset',
    } as Transaction

    expect(summarizeAccount(legacyAsset, [lent]).balance).toBe(5000)
  })
})
