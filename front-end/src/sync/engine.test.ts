import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken } from '@/auth/api'
import { db } from '@/db/db'
import type { Account, Budget, Category } from '@/db/types'
import { foodDb } from '@/food/db'
import type { MealLog } from '@/db/types'
import { foodSync, moneySync, runSync } from './engine'

const category: Category = {
  id: 'category-id',
  name: 'Housing',
  icon: 'tag',
  color: null,
  transaction_type: 'expense',
  is_system: true,
  is_hidden: false,
  version: 1,
  sync_state: 'synced',
  status: 'active',
  created_at: '2026-10-23T00:00:00.000Z',
  updated_at: '2026-10-23T00:00:00.000Z',
}

const budget: Budget = {
  id: 'budget-id',
  group_id: null,
  category_id: category.id,
  name: category.name,
  amount_minor: 2700000,
  currency: 'INR',
  period: 'monthly',
  period_start: '2026-10-01',
  period_end: null,
  alert_threshold_percent: 80,
  is_active: true,
  version: 1,
  sync_state: 'pending',
  status: 'active',
  created_at: '2026-10-23T00:00:00.000Z',
  updated_at: '2026-10-23T00:00:00.000Z',
}

describe('sync dependencies', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setAccessToken(null)
  })

  beforeEach(async () => {
    setAccessToken(null)
    await Promise.all(db.tables.map((table) => table.clear()))
  })

  it('pushes a synced category when a pending budget depends on it', async () => {
    await db.categories.add(category)
    await db.budgets.add(budget)

    let pushedCategories: Category[] = []
    const requestPaths: string[] = []
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = new URL(String(input)).pathname
      requestPaths.push(path)
      if (path === '/api/sync/money/push') {
        const body = JSON.parse(String(init?.body)) as { categories: Category[] }
        pushedCategories = body.categories
        return new Response(JSON.stringify({ accepted: [], conflicts: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })

        it('pulls a changed default and clears the previous default on another device', async () => {
          const oldAccount: Account = {
            id: 'old',
            name: 'Old',
            account_type: 'bank',
            currency: 'INR',
            opening_balance: 0,
            credit_limit: null,
            is_default: true,
            version: 1,
            sync_state: 'synced',
            status: 'active',
            created_at: '2026-10-23T00:00:00.000Z',
            updated_at: '2026-10-23T00:00:00.000Z',
          }
          const newAccount = { ...oldAccount, id: 'new', name: 'New', is_default: false }
          await db.accounts.bulkAdd([oldAccount, newAccount])
          vi.stubGlobal('localStorage', {
            getItem: () => '2026-10-23T00:00:00.000Z',
            setItem: () => undefined,
            removeItem: () => undefined,
          })
          vi.stubGlobal(
            'fetch',
            vi.fn<typeof fetch>(async (input) => {
              const path = new URL(String(input)).pathname
              const body =
                path === '/api/sync/money/pull'
                  ? {
                      accounts: [
                        { ...oldAccount, is_default: false, version: 2 },
                        { ...newAccount, is_default: true, version: 2 },
                      ],
                      server_time: '2026-10-24T00:00:00.000Z',
                    }
                  : {}
              return new Response(JSON.stringify(body), {
                status: 200,
                headers: { 'Content-Type': 'application/json' },
              })
            }),
          )
          await runSync(moneySync, 'token', 'user')
          expect((await db.accounts.get('old'))?.is_default).toBe(false)
          expect((await db.accounts.get('new'))?.is_default).toBe(true)
        })
      }
      if (path === '/api/sync/money/pull') {
        return new Response(
          JSON.stringify({
            categories: [],
            accounts: [],
            merchants: [],
            transactions: [],
            budgets: [],
            server_time: '2026-10-23T00:00:00.000Z',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    })

    await runSync(moneySync, 'token', 'user')

    expect(pushedCategories).toContainEqual(category)
    expect(requestPaths.indexOf('/api/sync/money/pull')).toBeLessThan(
      requestPaths.indexOf('/api/sync/money/push'),
    )
  })

  it('merges a duplicate category into the server category after the initial pull', async () => {
    const serverCategory = { ...category, id: 'server-category', sync_state: 'synced' as const }
    await db.categories.add(category)
    await db.budgets.add(budget)

    let pullCount = 0
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(String(input)).pathname
      if (path === '/api/sync/money/push') {
        return new Response(
          JSON.stringify({
            accepted: [
              {
                entity: 'categories',
                id: category.id,
                canonical_id: serverCategory.id,
              },
            ],
            conflicts: [],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      if (path === '/api/sync/money/pull') {
        pullCount += 1
        return new Response(
          JSON.stringify({
            categories: [serverCategory],
            accounts: [],
            merchants: [],
            transactions: [],
            budgets: [],
            due_payments: [],
            server_time: `2026-10-23T00:00:0${pullCount}.000Z`,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => undefined,
      removeItem: () => undefined,
    })

    await runSync(moneySync, 'token', 'user')

    expect(await db.categories.toArray()).toEqual([serverCategory])
    expect((await db.budgets.get(budget.id))?.category_id).toBe(serverCategory.id)
  })

  it('stores group snapshots from sync and removes memberships absent from the next snapshot', async () => {
    const activeGroup = {
      id: 'active-group',
      name: 'Weekend trip',
      description: null,
      group_type: 'friends',
      currency: 'INR',
      created_by: 'alice',
    }
    const invitedGroup = { ...activeGroup, id: 'invited-group', name: 'Family' }
    let groups = [activeGroup]
    let invitations = [invitedGroup]
    let pullCount = 0
    const requestPaths: string[] = []
    const storage = new Map<string, string>()
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(String(input)).pathname
      requestPaths.push(path)
      if (path === '/api/sync/money/pull') {
        pullCount += 1
        return new Response(
          JSON.stringify({
            categories: [],
            accounts: [],
            merchants: [],
            transactions: [],
            budgets: [],
            due_payments: [],
            groups,
            invitations,
            server_time: `2026-10-24T00:00:0${pullCount}.000Z`,
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        )
      }
      return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    })
    vi.stubGlobal('fetch', fetchMock)
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })

    await runSync(moneySync, 'token', 'alice')

    expect(await db.groups.toArray()).toEqual([
      { ...activeGroup, membership_status: 'active' },
      { ...invitedGroup, membership_status: 'invited' },
    ])
    expect(requestPaths).not.toContain('/money/groups')
    expect(requestPaths).not.toContain('/money/groups/invitations')

    invitations = []
    await runSync(moneySync, 'token', 'alice')

    expect(await db.groups.toArray()).toEqual([{ ...activeGroup, membership_status: 'active' }])
  })

  it('syncs My Food on its own endpoints, leaving My Money alone', async () => {
    const log: MealLog = {
      id: 'meal-1',
      entry_date: '2026-11-20',
      meal: 'lunch',
      food_id: 'egg',
      food_name: 'Egg',
      weight_g: 50,
      calories: 70,
      protein: 6,
      carbs: 0,
      fat: 5,
      calories_100g: null,
      protein_100g: null,
      carbs_100g: null,
      fat_100g: null,
      image: null,
      version: 1,
      sync_state: 'pending',
      status: 'active',
      created_at: '2026-11-20T00:00:00.000Z',
      updated_at: '2026-11-20T00:00:00.000Z',
    }
    await foodDb.meal_logs.clear()
    await foodDb.meal_logs.add(log)
    const requestPaths: string[] = []
    const storage = new Map<string, string>()
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (input) => {
        const path = new URL(String(input)).pathname
        requestPaths.push(path)
        const body =
          path === '/api/sync/food/push'
            ? { accepted: [{ entity: 'meal_logs', id: log.id }], conflicts: [] }
            : { meal_logs: [], server_time: '2026-11-21T00:00:00.000Z' }
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }),
    )
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
      removeItem: (key: string) => storage.delete(key),
    })

    await runSync(foodSync, 'token', 'alice')

    expect(requestPaths).toEqual([
      '/api/sync/food/pull',
      '/api/sync/food/push',
      '/api/sync/food/pull',
    ])
    expect((await foodDb.meal_logs.get(log.id))?.sync_state).toBe('synced')
    expect(storage.get('exptracker.sync.food.cursor.alice')).toBe('2026-11-21T00:00:00.000Z')
    expect(storage.has('exptracker.sync.cursor.alice')).toBe(false)
  })
})
