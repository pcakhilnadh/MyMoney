import { describe, expect, it } from 'vitest'
import { addDays, dateKey, localDate, streaks, total, type FoodEntry } from './diary'

function entry(date: string, calories: number | null): FoodEntry {
  return {
    id: date,
    entry_date: date,
    meal: 'breakfast',
    food_id: 'food',
    food_name: 'Food',
    weight_g: 100,
    calories,
    protein: 1,
    carbs: 1,
    fat: 1,
    calories_100g: calories,
    protein_100g: 1,
    carbs_100g: 1,
    fat_100g: 1,
    image: null,
    version: 1,
    sync_state: 'synced',
    status: 'active',
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  }
}

describe('food diary calculations', () => {
  it('keeps missing nutrition distinct from zero', () => {
    expect(total([], 'calories')).toBe(0)
    expect(total([entry('2026-10-01', 100), entry('2026-10-02', null)], 'calories')).toBeNull()
  })
  it('counts consecutive logged dates, including yesterday but not future dates', () => {
    const entries = [
      '2026-10-01',
      '2026-10-02',
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-08',
    ].map((date) => entry(date, 1))
    expect(streaks(entries, localDate('2026-10-07'))).toEqual({ current: 3, longest: 3 })
    expect(streaks(entries, localDate('2026-10-10'))).toEqual({ current: 0, longest: 3 })
    expect(dateKey(addDays(localDate('2026-03-01'), -1))).toBe('2026-02-28')
  })
})
