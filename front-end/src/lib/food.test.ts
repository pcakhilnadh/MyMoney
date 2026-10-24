import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { db } from '@/db/db'
import {
  entriesForMeal,
  getEntries,
  migrateLegacyFoodStorage,
  trackedDates,
} from './food'

function storageMock() {
  const values = new Map<string, string>()
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
}

describe('food local-first storage', () => {
  afterEach(() => vi.unstubAllGlobals())

  beforeEach(async () => {
    await Promise.all(db.tables.map((table) => table.clear()))
    vi.stubGlobal('localStorage', storageMock())
  })

  it('migrates legacy Food diary and custom library data into syncable records', async () => {
    localStorage.setItem(
      'myfood.entries.v1',
      JSON.stringify([
        {
          id: 'legacy-entry',
          date: '2026-10-24',
          meal: 'breakfast',
          name: 'Oatmeal',
          quantity: 1,
          unit: 'serving',
          createdAt: '2026-10-24T07:00:00.000Z',
        },
      ]),
    )
    localStorage.setItem('myfood.custom.v1', JSON.stringify(['Green smoothie']))

    await migrateLegacyFoodStorage()

    const [entry] = await getEntries()
    expect(entry).toMatchObject({
      id: 'legacy-entry',
      entry_date: '2026-10-24',
      sync_state: 'pending',
      status: 'active',
    })
    expect(await db.food_library.toArray()).toEqual([
      expect.objectContaining({
        name: 'Green smoothie',
        normalized_name: 'green smoothie',
        sync_state: 'pending',
      }),
    ])
    expect(localStorage.getItem('myfood.entries.v1')).toBeNull()
  })

  it('preserves legacy data when it cannot be migrated safely', async () => {
    localStorage.setItem('myfood.entries.v1', JSON.stringify({ unexpected: 'object' }))

    await expect(migrateLegacyFoodStorage()).rejects.toThrow(
      'Legacy Food diary must be an array',
    )

    expect(localStorage.getItem('myfood.entries.v1')).toBe(
      JSON.stringify({ unexpected: 'object' }),
    )
    expect(await db.food_entries.toArray()).toEqual([])
  })

  it('computes meal and tracked-date views from the local records', async () => {
    await db.food_entries.add({
      id: 'entry-1',
      entry_date: '2026-10-24',
      meal: 'lunch',
      name: 'Rice bowl',
      quantity: 1,
      unit: 'bowl',
      version: 1,
      status: 'active',
      sync_state: 'synced',
      created_at: '2026-10-24T12:00:00.000Z',
      updated_at: '2026-10-24T12:00:00.000Z',
    })
    const entries = await getEntries()
    expect(entriesForMeal('2026-10-24', 'lunch', entries)).toHaveLength(1)
    expect(trackedDates(entries)).toEqual(['2026-10-24'])
  })
})
