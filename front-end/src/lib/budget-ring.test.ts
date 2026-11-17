import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '@/db/types'
import { computeBudgetRing } from './budget-ring'

const cat = (id: string, name: string) => ({ id, name }) as Category
const tx = (
  id: string,
  categoryId: string,
  amount: number,
  date: string,
  type = 'expense',
): Transaction =>
  ({
    id,
    category_id: categoryId,
    amount_minor: amount,
    transaction_date: `${date}T10:00:00.000Z`,
    transaction_type: type,
  }) as Transaction

const cats = [cat('f', 'Food'), cat('t', 'Travel')]
const base = { cats, month: '2026-11', today: '2026-11-10', dayOfMonth: 10, daysInMonth: 30 }

describe('computeBudgetRing', () => {
  it('computes safe-to-spend from the remaining budget over the days left', () => {
    // budget 30000, 6000 spent before today, 1000 today; 21 days left including today.
    const txs = [tx('1', 'f', 6000, '2026-11-03'), tx('2', 't', 1000, '2026-11-10')]
    const ring = computeBudgetRing({ ...base, txs, budget: 30000 })
    // (30000 - 6000) / 21 = 1142, minus 1000 already spent today
    expect(ring.safeToday).toBe(142)
    expect(ring.spent).toBe(7000)
    expect(ring.overBudget).toBe(false)
    expect(ring.segments[0]).toMatchObject({ name: 'Food', fraction: 0.2 })
  })

  it('has nothing safe to spend once the budget is used up', () => {
    const txs = [tx('1', 'f', 40000, '2026-11-02')]
    const ring = computeBudgetRing({ ...base, txs, budget: 30000 })
    expect(ring.safeToday).toBe(0)
    expect(ring.overBudget).toBe(true)
    expect(ring.segments[0].fraction).toBe(1)
  })

  it('splits spending across the whole ring when no budget is set', () => {
    const txs = [tx('1', 'f', 3000, '2026-11-02'), tx('2', 't', 1000, '2026-11-03')]
    const ring = computeBudgetRing({ ...base, txs, budget: null })
    expect(ring.safeToday).toBeNull()
    expect(ring.segments.map((s) => s.fraction)).toEqual([0.75, 0.25])
  })

  it('nets refunds and groups the long tail into Other', () => {
    const many = Array.from({ length: 6 }, (_, i) => cat(`c${i}`, `Cat${i}`))
    const txs = many.map((c, i) => tx(`e${i}`, c.id, 1000 * (6 - i), '2026-11-02'))
    txs.push(tx('r', 'c0', 500, '2026-11-04', 'refund'))
    const ring = computeBudgetRing({ ...base, cats: many, txs, budget: null })
    expect(ring.segments).toHaveLength(5)
    expect(ring.segments[4].name).toBe('Other')
    expect(ring.spent).toBe(21000 - 500)
  })
})
