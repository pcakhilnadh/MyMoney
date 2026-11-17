import { describe, expect, it } from 'vitest'
import type { Transaction } from '@/db/types'
import { computeSpendPace } from './spend-pace'

const tx = (amount: number, date: string, type = 'expense'): Transaction =>
  ({
    amount_minor: amount,
    transaction_date: `${date}T10:00:00.000Z`,
    transaction_type: type,
  }) as Transaction

const base = { month: '2026-11', daysInMonth: 30 }

describe('computeSpendPace', () => {
  it('builds a cumulative series and compares it to the ideal pace', () => {
    const txs = [tx(1000, '2026-11-01'), tx(500, '2026-11-03'), tx(200, '2026-11-03', 'refund')]
    const pace = computeSpendPace({ ...base, txs, dayOfMonth: 3, budget: 30000 })
    expect(pace.cumulative).toEqual([1000, 1000, 1300])
    expect(pace.spentToday).toBe(300)
    expect(pace.idealToday).toBe(3000)
    expect(pace.ahead).toBe(-1700)
  })

  it('projects the day the budget runs out at the current pace', () => {
    // 10000 over 5 days = 2000/day; 20000 budget -> 5 more days -> day 10
    const pace = computeSpendPace({
      ...base,
      txs: [tx(10000, '2026-11-02')],
      dayOfMonth: 5,
      budget: 20000,
    })
    expect(pace.limitDay).toBe(10)
    expect(pace.limitReached).toBe(false)
  })

  it('has no projected day when the budget lasts the month', () => {
    const pace = computeSpendPace({
      ...base,
      txs: [tx(100, '2026-11-02')],
      dayOfMonth: 5,
      budget: 20000,
    })
    expect(pace.limitDay).toBeNull()
  })

  it('reports the day the limit was already reached', () => {
    const pace = computeSpendPace({
      ...base,
      txs: [tx(25000, '2026-11-04')],
      dayOfMonth: 6,
      budget: 20000,
    })
    expect(pace.limitDay).toBe(4)
    expect(pace.limitReached).toBe(true)
  })

  it('works on day one', () => {
    const pace = computeSpendPace({
      ...base,
      txs: [tx(1500, '2026-11-01')],
      dayOfMonth: 1,
      budget: 30000,
    })
    expect(pace.cumulative).toEqual([1500])
    // 1500/day against a 30000 budget -> day 20
    expect(pace.limitDay).toBe(20)
  })

  it('has no pace comparison without a budget', () => {
    const pace = computeSpendPace({ ...base, txs: [], dayOfMonth: 2, budget: null })
    expect(pace.ahead).toBeNull()
    expect(pace.limitDay).toBeNull()
    expect(pace.cumulative).toEqual([0, 0])
  })
})
