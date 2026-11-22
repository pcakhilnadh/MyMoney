import { describe, expect, it } from 'vitest'
import { weekDays, weekStart } from './dates'

describe('weekStart', () => {
  it('starts the week on Sunday', () => {
    expect(weekStart('2026-11-22')).toBe('2026-11-22') // a Sunday
    expect(weekStart('2026-11-23')).toBe('2026-11-22') // Monday
    expect(weekStart('2026-11-28')).toBe('2026-11-22') // Saturday
    expect(weekStart('2026-11-29')).toBe('2026-11-29') // next Sunday
  })

  it('lists Sunday to Saturday', () => {
    const days = weekDays(weekStart('2026-11-25'))
    expect(days[0]).toBe('2026-11-22')
    expect(days[6]).toBe('2026-11-28')
  })
})
