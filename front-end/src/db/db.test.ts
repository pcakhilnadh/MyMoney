import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { db } from './db'
import { accountsRepo, transactionsRepo } from './repos'
import { seedIfEmpty } from './seed'
import { formatMinor, toMinor } from '@/lib/money'

const base = {
  account_id: '',
  transfer_to_account_id: null,
  category_id: null,
  group_id: null,
  context: 'personal' as const,
  transaction_type: 'expense' as const,
  merchant: null,
  currency: 'INR',
  notes: null,
  is_shared: false,
  split_method: null,
}

beforeEach(async () => {
  await Promise.all(db.tables.map((t) => t.clear()))
})

describe('repository', () => {
  it('creates pending records and bumps version on update', async () => {
    const account = await accountsRepo.create({
      name: 'Everyday',
      account_type: 'bank',
      currency: 'INR',
      opening_balance: 0,
      credit_limit: null,
      is_default: false,
    })
    const t = await transactionsRepo.create({
      ...base,
      account_id: account.id,
      description: 'Tea',
      amount_minor: 2000,
      transaction_date: '2026-10-01T00:00:00Z',
    })
    expect(t.sync_state).toBe('pending')
    const u = await transactionsRepo.update(t.id, { amount_minor: 2500 })
    expect(u.version).toBe(2)
  })

  it('soft-deletes and hides from list', async () => {
    const account = await accountsRepo.create({
      name: 'Everyday',
      account_type: 'bank',
      currency: 'INR',
      opening_balance: 0,
      credit_limit: null,
      is_default: false,
    })
    const t = await transactionsRepo.create({
      ...base,
      account_id: account.id,
      description: 'x',
      amount_minor: 100,
      transaction_date: '2026-10-01T00:00:00Z',
    })
    await transactionsRepo.remove(t.id)
    expect(await transactionsRepo.list()).toHaveLength(0)
    expect((await db.transactions.get(t.id))?.status).toBe('deleted')
  })

  it('sorts newest first', async () => {
    const account = await accountsRepo.create({
      name: 'Everyday',
      account_type: 'bank',
      currency: 'INR',
      opening_balance: 0,
      credit_limit: null,
      is_default: false,
    })
    for (const d of ['2026-10-01', '2026-10-03', '2026-10-02'])
      await transactionsRepo.create({
        ...base,
        account_id: account.id,
        description: d,
        amount_minor: 100,
        transaction_date: d,
      })
    const l = await transactionsRepo.listByDate()
    expect(l.map((t) => t.description)).toEqual(['2026-10-03', '2026-10-02', '2026-10-01'])
  })

  it('requires an active account for transactions', async () => {
    await expect(
      transactionsRepo.create({
        ...base,
        description: 'Tea',
        amount_minor: 2000,
        transaction_date: '2026-10-01T00:00:00Z',
      }),
    ).rejects.toThrow('An active account is required')
  })

  it('requires a different destination account for transfers', async () => {
    const source = await accountsRepo.create({
      name: 'Checking',
      account_type: 'bank',
      currency: 'INR',
      opening_balance: 0,
      credit_limit: null,
      is_default: false,
    })
    await expect(
      transactionsRepo.create({
        ...base,
        account_id: source.id,
        transaction_type: 'transfer',
        description: 'Move money',
        amount_minor: 2000,
        transaction_date: '2026-10-01T00:00:00Z',
      }),
    ).rejects.toThrow('destination account is required')
  })
})

describe('seed and money', () => {
  it('seeds once', async () => {
    await seedIfEmpty()
    await seedIfEmpty()
    expect(await db.categories.count()).toBe(9)
    expect(await db.accounts.count()).toBe(0)
  })

  it('removes the unused legacy seeded default account', async () => {
    const account = await accountsRepo.create({
      name: 'Cash',
      account_type: 'cash',
      currency: 'INR',
      opening_balance: 0,
      credit_limit: null,
      is_default: true,
    })

    await seedIfEmpty()

    expect(await accountsRepo.get(account.id)).toBeUndefined()
  })

  it('preserves a legacy seeded account that has transactions', async () => {
    const account = await accountsRepo.create({
      name: 'Cash',
      account_type: 'cash',
      currency: 'INR',
      opening_balance: 0,
      credit_limit: null,
      is_default: true,
    })
    await transactionsRepo.create({
      ...base,
      account_id: account.id,
      description: 'Tea',
      amount_minor: 2000,
      transaction_date: '2026-10-01T00:00:00Z',
    })

    await seedIfEmpty()

    expect(await accountsRepo.get(account.id)).toBeDefined()
  })

  it('handles money', () => {
    expect(toMinor('12.34')).toBe(1234)
    expect(toMinor('abc')).toBe(0)
    expect(formatMinor(123456)).toContain('1,234.56')
  })
})
