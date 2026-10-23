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
    const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
      const path = new URL(String(input)).pathname
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
    })

    await runSync('token', 'user')

    expect(pushedCategories).toContainEqual(category)
  })
})
