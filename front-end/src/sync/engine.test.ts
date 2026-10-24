import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken } from '@/auth/api'
import { db } from '@/db/db'
import type { Budget, Category } from '@/db/types'
import { runSync } from './engine'

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
      if (path === '/sync/push') {
        const body = JSON.parse(String(init?.body)) as { categories: Category[] }
        pushedCategories = body.categories
        return new Response(JSON.stringify({ accepted: [], conflicts: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      if (path === '/sync/pull') {
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

    await runSync('token', 'user')

    expect(pushedCategories).toContainEqual(category)
    expect(requestPaths.indexOf('/sync/pull')).toBeLessThan(requestPaths.indexOf('/sync/push'))
  })

  it('merges a duplicate category into the server category after the initial pull', async () => {
    const serverCategory = { ...category, id: 'server-category', sync_state: 'synced' as const }
    await db.categories.add(category)
    await db.budgets.add(budget)

    let pullCount = 0
    const fetchMock = vi.fn<typeof fetch>(async (input) => {
      const path = new URL(String(input)).pathname
      if (path === '/sync/push') {
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
      if (path === '/sync/pull') {
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

    await runSync('token', 'user')

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
      if (path === '/sync/pull') {
        pullCount += 1
        return new Response(
          JSON.stringify({
            categories: [],
            accounts: [],
            merchants: [],
            transactions: [],
            budgets: [],
            due_payments: [],
            food_entries: [],
            food_library: [],
            habits: [],
            habit_logs: [],
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

    await runSync('token', 'alice')

    expect(await db.groups.toArray()).toEqual([
      { ...activeGroup, membership_status: 'active' },
      { ...invitedGroup, membership_status: 'invited' },
    ])
    expect(requestPaths).not.toContain('/money/groups')
    expect(requestPaths).not.toContain('/money/groups/invitations')

    invitations = []
    await runSync('token', 'alice')

    expect(await db.groups.toArray()).toEqual([
      { ...activeGroup, membership_status: 'active' },
    ])
  })
})
