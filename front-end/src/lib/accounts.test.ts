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
})
