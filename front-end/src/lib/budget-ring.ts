import type { Category, Transaction } from '@/db/types'

export const RING_COLORS = ['#f5ae4b', '#b69dff', '#5ce0ff', '#94b0ff', '#18265c']
const MAX_SEGMENTS = RING_COLORS.length

export interface RingSegment {
  name: string
  value: number
  /** Share of the full ring (0-1). */
  fraction: number
  color: string
}

export interface BudgetRing {
  segments: RingSegment[]
  spent: number
  budget: number | null
  /** What can still be spent today without overrunning the month; null without a budget. */
  safeToday: number | null
  overBudget: boolean
}

function netSpendByCategory(
  txs: Transaction[],
  cats: Category[],
  month: string,
): { name: string; value: number }[] {
  const names = new Map(cats.map((c) => [c.id, c.name]))
  const totals = new Map<string, number>()
  for (const t of txs) {
    if (t.transaction_type !== 'expense' && t.transaction_type !== 'refund') continue
    if (!t.transaction_date.startsWith(month)) continue
    const name = (t.category_id && names.get(t.category_id)) || 'Uncategorised'
    const signed = t.transaction_type === 'expense' ? t.amount_minor : -t.amount_minor
    totals.set(name, (totals.get(name) ?? 0) + signed)
  }
  return [...totals]
    .map(([name, value]) => ({ name, value }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value)
}

/**
 * With a budget the ring is the budget: each category fills the share it used.
 * Without one the ring is the month's spending split by category.
 */
export function computeBudgetRing(input: {
  txs: Transaction[]
  cats: Category[]
  month: string
  today: string
  dayOfMonth: number
  daysInMonth: number
  budget: number | null
}): BudgetRing {
  const { txs, cats, month, today, dayOfMonth, daysInMonth, budget } = input
  const categories = netSpendByCategory(txs, cats, month)
  const spent = categories.reduce((sum, item) => sum + item.value, 0)

  const shown = categories.slice(0, MAX_SEGMENTS - 1)
  const rest = categories.slice(MAX_SEGMENTS - 1)
  const restValue = rest.reduce((sum, item) => sum + item.value, 0)
  const grouped = rest.length === 1 ? [...shown, rest[0]] : shown
  if (rest.length > 1) grouped.push({ name: 'Other', value: restValue })

  const denominator = budget === null ? spent : Math.max(budget, spent)
  const segments = grouped.map((item, index) => ({
    ...item,
    fraction: denominator > 0 ? item.value / denominator : 0,
    color: RING_COLORS[index],
  }))

  let safeToday: number | null = null
  if (budget !== null) {
    const spentToday = txs
      .filter((t) => t.transaction_date.slice(0, 10) === today)
      .reduce((sum, t) => {
        if (t.transaction_type === 'expense') return sum + t.amount_minor
        if (t.transaction_type === 'refund') return sum - t.amount_minor
        return sum
      }, 0)
    const daysLeft = Math.max(daysInMonth - dayOfMonth + 1, 1)
    const remainingAtDayStart = budget - (spent - spentToday)
    const dailyLimit = Math.floor(Math.max(remainingAtDayStart, 0) / daysLeft)
    safeToday = Math.max(dailyLimit - spentToday, 0)
  }

  return { segments, spent, budget, safeToday, overBudget: budget !== null && spent > budget }
}
