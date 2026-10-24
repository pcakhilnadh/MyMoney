import 'fake-indexeddb/auto'
import Dexie from 'dexie'
import { beforeEach, describe, expect, it } from 'vitest'
import { AppDB, db } from './db'
import { clearLocalDatabase } from './clear'
import { accountsRepo, categoriesRepo, merchantsRepo, transactionsRepo } from './repos'
import { seedIfEmpty } from './seed'
import { DEFAULT_CATEGORIES, formatMinor, normalizeMoneyInput, toMinor } from '@/lib/money'

const base = {
  account_id: '',
  transfer_to_account_id: null,
  category_id: null,
  group_id: null,
  context: 'personal' as const,
  transaction_type: 'expense' as const,
  long_description: null,
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
      title: 'Tea',
      amount_minor: 2000,
      transaction_date: '2026-10-01T00:00:00Z',
    })
    expect(t.sync_state).toBe('pending')
    const u = await transactionsRepo.update(t.id, { amount_minor: 2500 })
    expect(u.version).toBe(2)
  })

  it('stores merchant names once per signed-in user', async () => {
    await merchantsRepo.ensure('Amazon')
    await merchantsRepo.ensure(' amazon ')
    expect((await merchantsRepo.list()).map((merchant) => merchant.name)).toEqual(['Amazon'])
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
      title: 'x',
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
        title: d,
        amount_minor: 100,
        transaction_date: d,
      })
    const l = await transactionsRepo.listByDate()
    expect(l.map((t) => t.title)).toEqual(['2026-10-03', '2026-10-02', '2026-10-01'])
  })

  it('sorts transactions saved on the same day by latest save first', async () => {
    const account = await accountsRepo.create({
      name: 'Everyday',
      account_type: 'bank',
      currency: 'INR',
      opening_balance: 0,
      credit_limit: null,
      is_default: false,
    })
    const savedEarlier = await transactionsRepo.create({
      ...base,
      account_id: account.id,
      title: 'Saved earlier',
      amount_minor: 100,
      transaction_date: '2026-10-01T12:00:00Z',
    })
    const savedLater = await transactionsRepo.create({
      ...base,
      account_id: account.id,
      title: 'Saved later',
      amount_minor: 100,
      transaction_date: '2026-10-01T12:00:00Z',
    })
    await db.transactions.update(savedEarlier.id, {
      created_at: '2026-10-01T09:00:00Z',
      updated_at: '2026-10-01T09:00:00Z',
    })
    await db.transactions.update(savedLater.id, {
      created_at: '2026-10-01T10:00:00Z',
      updated_at: '2026-10-01T10:00:00Z',
    })

    expect((await transactionsRepo.listByDate()).map((transaction) => transaction.title)).toEqual([
      'Saved later',
      'Saved earlier',
    ])
    expect(
      (await transactionsRepo.listByDateRange('2026-10-01', '2026-11-01')).map(
        (transaction) => transaction.title,
      ),
    ).toEqual(['Saved later', 'Saved earlier'])
  })

  it('lists active transaction ranges and detects older records', async () => {
    const account = await accountsRepo.create({
      name: 'Everyday',
      account_type: 'bank',
      currency: 'INR',
      opening_balance: 0,
      credit_limit: null,
      is_default: false,
    })
    for (const date of [
      '2026-09-30T00:00:00Z',
      '2026-10-01T00:00:00Z',
      '2026-10-31T23:00:00Z',
      '2026-11-01T00:00:00Z',
    ])
      await transactionsRepo.create({
        ...base,
        account_id: account.id,
        title: date,
        amount_minor: 100,
        transaction_date: date,
      })

    const october = await transactionsRepo.listByDateRange('2026-10-01', '2026-11-01')
    expect(october.map((transaction) => transaction.transaction_date)).toEqual([
      '2026-10-31T23:00:00Z',
      '2026-10-01T00:00:00Z',
    ])
    expect(await transactionsRepo.hasByDateBefore('2026-10-01')).toBe(true)
    expect(await transactionsRepo.hasByDateBefore('2026-09-01')).toBe(false)
  })

  it('requires an active account for transactions', async () => {
    await expect(
      transactionsRepo.create({
        ...base,
        title: 'Tea',
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
        title: 'Move money',
        amount_minor: 2000,
        transaction_date: '2026-10-01T00:00:00Z',
      }),
    ).rejects.toThrow('destination account is required')
  })

  it('validates category type and accounting-aware transfer categories', async () => {
    const bank = await accountsRepo.create({
      name: 'Checking',
      account_type: 'bank',
      currency: 'INR',
      opening_balance: 0,
      credit_limit: null,
      is_default: false,
    })
    const otherBank = await accountsRepo.create({
      name: 'Savings',
      account_type: 'bank',
      currency: 'INR',
      opening_balance: 0,
      credit_limit: null,
      is_default: false,
    })
    const lentCategory = await categoriesRepo.create({
      name: 'Money Lent',
      icon: 'tag',
      color: null,
      transaction_type: 'transfer',
      is_system: true,
      is_hidden: false,
    })

    await expect(
      transactionsRepo.create({
        ...base,
        account_id: bank.id,
        transfer_to_account_id: otherBank.id,
        category_id: lentCategory.id,
        transaction_type: 'transfer',
        title: 'Lend money',
        amount_minor: 1000,
        transaction_date: '2026-10-01T00:00:00Z',
      }),
    ).rejects.toThrow('Money Lent must go to an Asset account')

    const asset = await accountsRepo.create({
      name: 'Owed by Sam',
      account_type: 'asset',
      currency: 'INR',
      opening_balance: 0,
      credit_limit: null,
      is_default: false,
    })
    const transfer = await transactionsRepo.create({
      ...base,
      account_id: bank.id,
      transfer_to_account_id: asset.id,
      category_id: lentCategory.id,
      transaction_type: 'transfer',
      title: 'Lend money',
      amount_minor: 1000,
      transaction_date: '2026-10-01T00:00:00Z',
    })
    expect(transfer.category_id).toBe(lentCategory.id)

    const incomeCategory = await categoriesRepo.create({
      name: 'Salary',
      icon: 'tag',
      color: null,
      transaction_type: 'income',
      is_system: true,
      is_hidden: false,
    })
    await expect(
      transactionsRepo.create({
        ...base,
        account_id: bank.id,
        category_id: incomeCategory.id,
        transaction_type: 'expense',
        title: 'Invalid category use',
        amount_minor: 1000,
        transaction_date: '2026-10-01T00:00:00Z',
      }),
    ).rejects.toThrow('category must match the transaction type')
  })
})

describe('local database cleanup', () => {
  it('clears every local data table', async () => {
    const timestamp = '2026-10-23T00:00:00.000Z'
    await db.accounts.add({
      id: 'account',
      name: 'Everyday',
      account_type: 'bank',
      currency: 'INR',
      opening_balance: 0,
      credit_limit: null,
      is_default: true,
      version: 1,
      sync_state: 'synced',
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp,
    })
    await db.categories.add({
      id: 'category',
      name: 'Food',
      icon: 'food',
      color: null,
      transaction_type: 'expense',
      is_system: true,
      is_hidden: false,
      version: 1,
      sync_state: 'synced',
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp,
    })
    await db.merchants.add({
      id: 'merchant',
      name: 'Cafe',
      normalized_name: 'cafe',
      version: 1,
      sync_state: 'synced',
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp,
    })
    await db.transactions.add({
      id: 'transaction',
      ...base,
      account_id: 'account',
      title: 'Tea',
      amount_minor: 100,
      transaction_date: timestamp,
      version: 1,
      sync_state: 'synced',
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp,
    })
    await db.budgets.add({
      id: 'budget',
      group_id: null,
      category_id: 'category',
      name: 'Food',
      amount_minor: 10000,
      currency: 'INR',
      period: 'monthly',
      period_start: '2026-10-01',
      period_end: null,
      alert_threshold_percent: 80,
      is_active: true,
      version: 1,
      sync_state: 'synced',
      status: 'active',
      created_at: timestamp,
      updated_at: timestamp,
    })

    await clearLocalDatabase()

    expect(await Promise.all(db.tables.map((table) => table.count()))).toEqual([0, 0, 0, 0, 0, 0])
  })
})

it('migrates saved transaction descriptions to titles', async () => {
  const name = `legacy-${crypto.randomUUID()}`
  const legacy = new Dexie(name)
  legacy.version(1).stores({
    accounts: 'id, status, sync_state',
    categories: 'id, transaction_type, status, sync_state',
    transactions:
      'id, transaction_date, context, group_id, category_id, status, sync_state, [status+transaction_date]',
    budgets: 'id, category_id, status, sync_state',
  })
  await legacy.open()
  await legacy.table('transactions').add({
    id: 'legacy-transaction',
    description: 'Old transaction',
    transaction_date: '2026-10-01T00:00:00Z',
  })
  legacy.close()

  const upgraded = new AppDB(name)
  await upgraded.open()
  const transaction = await upgraded.transactions.get('legacy-transaction')
  expect(transaction?.title).toBe('Old transaction')
  expect(transaction?.long_description).toBeNull()
  expect('description' in (transaction ?? {})).toBe(false)
  upgraded.close()
  await Dexie.delete(name)
})

it('deduplicates existing merchant suggestions during the database upgrade', async () => {
  const name = `legacy-merchants-${crypto.randomUUID()}`
  const legacy = new Dexie(name)
  legacy.version(2).stores({
    accounts: 'id, status, sync_state',
    categories: 'id, transaction_type, status, sync_state',
    merchants: 'id, name, status, sync_state',
    transactions:
      'id, transaction_date, context, group_id, category_id, status, sync_state, [status+transaction_date]',
    budgets: 'id, category_id, status, sync_state',
  })
  await legacy.open()
  await legacy.table('merchants').bulkAdd([
    { id: 'merchant-1', name: 'Amazon', version: 1, status: 'active' },
    { id: 'merchant-2', name: ' amazon ', version: 1, status: 'active' },
  ])
  legacy.close()

  const upgraded = new AppDB(name)
  await upgraded.open()
  const merchants = await upgraded.merchants.toArray()
  expect(merchants).toHaveLength(1)
  expect(merchants[0].name).toBe('Amazon')
  expect(merchants[0].normalized_name).toBe('amazon')
  upgraded.close()
  await Dexie.delete(name)
})

describe('seed and money', () => {
  it('seeds once', async () => {
    await seedIfEmpty()
    await seedIfEmpty()
    expect(await db.categories.count()).toBe(31)
    expect(
      (await categoriesRepo.list()).filter((category) => category.transaction_type === 'expense'),
    ).toHaveLength(15)
    expect(
      (await categoriesRepo.list()).filter((category) => category.transaction_type === 'income'),
    ).toHaveLength(9)
    expect(
      (await categoriesRepo.list()).filter((category) => category.transaction_type === 'transfer'),
    ).toHaveLength(7)
    expect(await db.accounts.count()).toBe(0)
  })

  it('migrates old default expense names in place and keeps their references', async () => {
    const legacy = await categoriesRepo.create({
      name: 'Food',
      icon: 'food',
      color: null,
      transaction_type: 'expense',
      is_system: true,
      is_hidden: false,
    })
    await seedIfEmpty()

    expect((await categoriesRepo.get(legacy.id))?.name).toBe('Food & Dining')
    expect((await categoriesRepo.list()).filter((category) => category.is_system)).toHaveLength(31)
    expect(DEFAULT_CATEGORIES.expense).toContain('Food & Dining')
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
      title: 'Tea',
      amount_minor: 2000,
      transaction_date: '2026-10-01T00:00:00Z',
    })

    await seedIfEmpty()

    expect(await accountsRepo.get(account.id)).toBeDefined()
  })

  it('handles two-decimal money input and stores paise as integers', () => {
    expect(normalizeMoneyInput('12.3')).toBe('12.3')
    expect(normalizeMoneyInput('12.345')).toBe('12.34')
    expect(normalizeMoneyInput('12.3.4')).toBe('12.34')
    expect(toMinor('12.34')).toBe(1234)
    expect(toMinor('abc')).toBe(0)
    expect(formatMinor(123456)).toContain('1,234.56')
  })
})
