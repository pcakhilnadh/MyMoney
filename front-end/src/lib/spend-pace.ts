import type { Transaction } from '@/db/types'

export interface SpendPace {
  /** Cumulative net spend at the end of each day 1..today (index 0 is day 1). */
  cumulative: number[]
  spent: number
  spentToday: number
  /** Spend an even daily pace of the budget would have reached by the end of today. */
  idealToday: number | null
  /** Positive when spending is ahead of (above) the ideal pace. */
  ahead: number | null
  /** Day of the month the budget runs out at the current pace, or null if it lasts. */
  limitDay: number | null
  /** True when the limit was already reached rather than projected. */
  limitReached: boolean
  /** Average spend per day so far. */
  dailyRate: number
}

export function computeSpendPace(input: {
  txs: Transaction[]
  month: string
  dayOfMonth: number
  daysInMonth: number
  budget: number | null
}): SpendPace {
  const { txs, month, dayOfMonth, daysInMonth, budget } = input
  const perDay = Array.from({ length: dayOfMonth }, () => 0)
  for (const t of txs) {
    if (t.transaction_type !== 'expense' && t.transaction_type !== 'refund') continue
    if (!t.transaction_date.startsWith(month)) continue
    const day = Number(t.transaction_date.slice(8, 10))
    if (day < 1 || day > dayOfMonth) continue
    perDay[day - 1] += t.transaction_type === 'expense' ? t.amount_minor : -t.amount_minor
  }
  let running = 0
  const cumulative = perDay.map((value) => (running += value))
  const spent = cumulative[dayOfMonth - 1] ?? 0
  const spentToday = perDay[dayOfMonth - 1] ?? 0
  const dailyRate = spent / dayOfMonth

  let limitDay: number | null = null
  let limitReached = false
  if (budget !== null && budget > 0) {
    const crossed = cumulative.findIndex((value) => value >= budget)
    if (crossed >= 0) {
      limitDay = crossed + 1
      limitReached = true
    } else if (dailyRate > 0) {
      const projected = Math.ceil(dayOfMonth + (budget - spent) / dailyRate)
      if (projected <= daysInMonth) limitDay = projected
    }
  }

  const idealToday = budget === null ? null : (budget * dayOfMonth) / daysInMonth
  return {
    cumulative,
    spent,
    spentToday,
    idealToday,
    ahead: idealToday === null ? null : spent - idealToday,
    limitDay,
    limitReached,
    dailyRate,
  }
}
