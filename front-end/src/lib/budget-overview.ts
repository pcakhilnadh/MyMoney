import type { Budget, Category, Transaction } from '@/db/types'
import { categoryBudgets } from '@/lib/budget'

export interface CategoryBudgetRow {
  categoryId: string | null
  name: string
  spent: number
  budget: number | null
  /** Share of the budget used (0+), null without a budget. */
  ratio: number | null
}

/** The month's highest-spending categories (net of refunds) paired with their budget, if any. */
export function topBudgetRows(input: {
  txs: Transaction[]
  cats: Category[]
  budgets: Budget[]
  month: string
  limit?: number
}): CategoryBudgetRow[] {
  const { txs, cats, budgets, month, limit = 5 } = input
  const names = new Map(cats.map((c) => [c.id, c.name]))
  const spent = new Map<string | null, number>()
  for (const t of txs) {
    if (t.transaction_type !== 'expense' && t.transaction_type !== 'refund') continue
    if (!t.transaction_date.startsWith(month)) continue
    const key = t.category_id ?? null
    const signed = t.transaction_type === 'expense' ? t.amount_minor : -t.amount_minor
    spent.set(key, (spent.get(key) ?? 0) + signed)
  }
  const limits = new Map(categoryBudgets(budgets).map((b) => [b.category_id, b.amount_minor]))

  // Budgeted categories show even before anything is spent in them.
  for (const key of limits.keys()) if (!spent.has(key)) spent.set(key, 0)

  return [...spent]
    .filter(([key, value]) => value > 0 || limits.has(key))
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([categoryId, value]) => {
      const budget = limits.get(categoryId) ?? null
      return {
        categoryId,
        name: (categoryId && names.get(categoryId)) || 'Uncategorised',
        spent: value,
        budget,
        ratio: budget !== null && budget > 0 ? value / budget : null,
      }
    })
}
