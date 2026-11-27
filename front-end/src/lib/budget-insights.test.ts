import { describe, expect, it } from 'vitest'
import type { Budget, Category, Transaction } from '@/db/types'
import { TOTAL_BUDGET_NAME } from './budget'
import { computeBudgetInsights } from './budget-insights'

const cat = (id: string, name: string) => ({ id, name }) as Category
const tx = (
  id: string,
  categoryId: string | null,
  amount: number,
  date: string,
  type = 'expense',
) =>
  ({
    id,
    category_id: categoryId,
    amount_minor: amount,
    transaction_date: `${date}T10:00:00.000Z`,
    transaction_type: type,
  }) as Transaction
const budget = (id: string, categoryId: string | null, amount: number, name = id) =>
  ({ id, category_id: categoryId, amount_minor: amount, name }) as Budget

const cats = [cat('f', 'Food'), cat('r', 'Rent'), cat('s', 'Shopping'), cat('h', 'Health')]
const base = {
  cats,
  month: '2026-11',
  prevMonth: '2026-10',
  dayOfMonth: 20,
  daysInMonth: 30,
  fmt: (minor: number) => `₹${minor / 100}`,
}
const total = (amount: number) => budget('t', null, amount, TOTAL_BUDGET_NAME)

describe('computeBudgetInsights', () => {
  it('pairs spend with allocations and flags over, near and unbudgeted categories', () => {
    const result = computeBudgetInsights({
      ...base,
      budgets: [
        total(100000),
        budget('bf', 'f', 10000),
        budget('br', 'r', 50000),
        budget('bh', 'h', 10000),
      ],
      txs: [
        tx('1', 'f', 12000, '2026-11-02'),
        tx('2', 'r', 45000, '2026-11-01'),
        tx('3', 's', 5000, '2026-11-05'),
        tx('4', 'f', 1000, '2026-11-06', 'refund'),
      ],
    })
    expect(result.rows.map((r) => [r.name, r.spent, r.status])).toEqual([
      ['Rent', 45000, 'near'],
      ['Food', 11000, 'over'],
      ['Shopping', 5000, 'unbudgeted'],
      ['Health', 0, 'ok'],
    ])
    expect(result.spent).toBe(61000)
    expect(result.allocated).toBe(70000)
    expect(result.unallocated).toBe(30000)
    expect(result.overspend).toBe(1000)
    expect(result.unbudgetedSpent).toBe(5000)
    const over = result.insights.find((i) => i.id === 'categories-over')
    expect(over?.text).toBe(
      'Food is ₹10 over its allocation. Your ₹300 unallocated budget still covers it.',
    )
  })

  it('warns when the month is projected over budget and says what a day can take', () => {
    const result = computeBudgetInsights({
      ...base,
      budgets: [total(30000)],
      txs: [tx('1', 'f', 24000, '2026-11-10')],
    })
    // 24000 over 20 days → 36000 by day 30; 6000 left over 11 days → 545 a day.
    expect(result.projected).toBe(36000)
    expect(result.perDayLeft).toBe(545)
    expect(result.insights[0]).toMatchObject({ id: 'month-projected', tone: 'warning' })
  })

  it('reports an overrun beyond the unallocated buffer', () => {
    const result = computeBudgetInsights({
      ...base,
      budgets: [total(20000), budget('bf', 'f', 15000), budget('bs', 's', 5000)],
      txs: [tx('1', 'f', 18000, '2026-11-03'), tx('2', 's', 1000, '2026-11-03')],
    })
    expect(result.insights.find((i) => i.id === 'categories-over')?.text).toContain(
      'it comes out of other categories',
    )
    // Late in the month, the barely-used Shopping allocation is suggested.
    expect(result.insights.find((i) => i.id === 'idle-allocations')?.text).toContain(
      'Shopping has ₹40 unused',
    )
  })

  it('compares with the same days of last month', () => {
    const result = computeBudgetInsights({
      ...base,
      budgets: [],
      txs: [
        tx('1', 'f', 150000, '2026-11-04'),
        tx('2', 'f', 100000, '2026-10-04'),
        tx('3', 'f', 900000, '2026-10-25'),
      ],
    })
    expect(result.lastMonthToDate).toBe(100000)
    expect(result.insights.find((i) => i.id === 'vs-last-month')).toMatchObject({
      value: '+50%',
      text: '₹500 (50%) more than by this day last month.',
      visual: { kind: 'compare', before: 100000, after: 150000 },
    })
    // Without a budget there is no month status tile.
    expect(result.insights.some((i) => i.id.startsWith('month-'))).toBe(false)
  })

  it('gives an on-track month useful tiles, wins first, without warning about trifles', () => {
    // ₹168 spent of ₹10K, ₹123 of it in one unbudgeted category, ₹45 more than last month.
    const result = computeBudgetInsights({
      ...base,
      budgets: [total(1000000)],
      txs: [
        tx('1', 'f', 12300, '2026-11-04'),
        tx('2', 'r', 4500, '2026-11-05'),
        tx('3', 'f', 12300, '2026-10-04'),
      ],
    })
    // Day 20: ₹168 so far → ₹252 by day 30, so ₹9,748 under the ₹10K budget.
    expect(result.insights.map((i) => [i.id, i.tone])).toEqual([
      ['projected-savings', 'good'],
      ['no-spend-days', 'good'],
      ['unbudgeted', 'info'],
      ['vs-last-month', 'info'],
      ['top-category', 'info'],
      ['largest-expense', 'info'],
    ])
    expect(result.insights.find((i) => i.id === 'no-spend-days')?.value).toBe('18')
    // The summary already says what's left today: no "on track" tile repeats it.
    expect(result.insights.some((i) => i.id === 'month-ok')).toBe(false)
  })
})
