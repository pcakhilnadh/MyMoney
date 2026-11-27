import type { Budget, Category, Transaction } from '@/db/types'
import { categoryBudgets, findTotalBudget } from '@/lib/budget'

/** Share of an allocation spent that counts as close to its limit. */
export const NEAR_SHARE = 0.85

export type RowStatus = 'over' | 'near' | 'ok' | 'unbudgeted'

export interface CategoryInsightRow {
  categoryId: string | null
  name: string
  /** Net spend this month (expenses minus refunds). */
  spent: number
  allocated: number | null
  /** Share of the month's total spend (0-1). */
  share: number
  status: RowStatus
  /** Expense transactions this month. */
  count: number
  /** Net spend over the same days of last month. */
  lastMonth: number
}

export type InsightTone = 'critical' | 'warning' | 'good' | 'info'

/** A small picture to go with an insight's number. */
export type InsightVisual =
  /** A fraction (0-1) of something, as a bar. */
  | { kind: 'share'; value: number }
  /** Last month to date against this month, as two bars. */
  | { kind: 'compare'; before: number; after: number }
  /** How much of an overrun (0-1) the unallocated budget covers. */
  | { kind: 'cover'; covered: number }

export interface Insight {
  id: string
  tone: InsightTone
  /** Short label, e.g. "Over allocation". */
  title: string
  /** The headline figure, e.g. "₹8.7K" or "+21%". */
  value: string
  /** One short line of context, e.g. the categories involved. */
  detail: string
  /** The whole finding as a sentence, for screen readers. */
  text: string
  visual?: InsightVisual
}

export interface BudgetInsights {
  total: number | null
  spent: number
  allocated: number
  /** Budget not given to any category (0 when over-allocated). */
  unallocated: number
  /** Allocated beyond the monthly budget. */
  overAllocated: number
  /** Sum of every category's spend beyond its own allocation. */
  overspend: number
  /** Spend in categories that have no allocation. */
  unbudgetedSpent: number
  /** Month-end spend if today's daily average continues. */
  projected: number
  /** What an even daily pace of the budget would have reached by today. */
  idealToday: number | null
  /** Days left in the month, today included. */
  daysLeft: number
  /** What can be spent per day for the rest of the month; null without a budget. */
  perDayLeft: number | null
  /** Spend over the same days of last month. */
  lastMonthToDate: number
  rows: CategoryInsightRow[]
  insights: Insight[]
}

function netSpend(t: Transaction): number {
  if (t.transaction_type === 'expense') return t.amount_minor
  if (t.transaction_type === 'refund') return -t.amount_minor
  return 0
}

/** "Nov" for "2026-11". */
function monthName(month: string): string {
  const [y, m] = month.split('-').map(Number)
  return new Date(y, m - 1, 1).toLocaleString('en', { month: 'short' })
}

const TONE_ORDER: Record<InsightTone, number> = { critical: 0, warning: 1, good: 2, info: 3 }

function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('')
  if (names.length === 2) return `${names[0]} and ${names[1]}`
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}

/**
 * Everything the Budgets overview shows: per-category spend against its allocation, the
 * month's totals and projection, and a short ranked list of plain-language insights.
 * `txs` must cover this month and the previous one; `fmt` formats minor units for the text.
 */
export function computeBudgetInsights(input: {
  txs: Transaction[]
  cats: Category[]
  budgets: Budget[]
  month: string
  prevMonth: string
  dayOfMonth: number
  daysInMonth: number
  fmt: (minor: number) => string
}): BudgetInsights {
  const { txs, cats, budgets, month, prevMonth, dayOfMonth, daysInMonth, fmt } = input
  const names = new Map(cats.map((c) => [c.id, c.name]))
  const total = findTotalBudget(budgets)?.amount_minor ?? null
  const allocations = new Map(categoryBudgets(budgets).map((b) => [b.category_id, b]))

  const byCategory = new Map<string | null, number>()
  let lastMonthToDate = 0
  const spendByDay = new Map<number, number>()
  let largest: Transaction | null = null
  const countByCategory = new Map<string | null, number>()
  const lastByCategory = new Map<string | null, number>()
  for (const t of txs) {
    const amount = netSpend(t)
    if (amount === 0) continue
    if (t.transaction_date.startsWith(month)) {
      const key = t.category_id ?? null
      byCategory.set(key, (byCategory.get(key) ?? 0) + amount)
      if (t.transaction_type === 'expense')
        countByCategory.set(key, (countByCategory.get(key) ?? 0) + 1)
      const day = Number(t.transaction_date.slice(8, 10))
      spendByDay.set(day, (spendByDay.get(day) ?? 0) + amount)
      if (t.transaction_type === 'expense' && (!largest || t.amount_minor > largest.amount_minor))
        largest = t
    } else if (
      t.transaction_date.startsWith(prevMonth) &&
      Number(t.transaction_date.slice(8, 10)) <= dayOfMonth
    ) {
      lastMonthToDate += amount
      const key = t.category_id ?? null
      lastByCategory.set(key, (lastByCategory.get(key) ?? 0) + amount)
    }
  }
  for (const key of allocations.keys()) if (!byCategory.has(key)) byCategory.set(key, 0)

  const spent = [...byCategory.values()].reduce((sum, v) => sum + Math.max(v, 0), 0)
  const allocated = [...allocations.values()].reduce((sum, b) => sum + b.amount_minor, 0)

  const rows: CategoryInsightRow[] = [...byCategory]
    .filter(([key, value]) => value > 0 || allocations.has(key))
    .map(([categoryId, value]) => {
      const budget = allocations.get(categoryId)
      const allocatedHere = budget?.amount_minor ?? null
      const ratio = allocatedHere ? value / allocatedHere : null
      const status: RowStatus =
        allocatedHere === null
          ? 'unbudgeted'
          : value > allocatedHere
            ? 'over'
            : ratio !== null && ratio >= NEAR_SHARE
              ? 'near'
              : 'ok'
      return {
        categoryId,
        name: (categoryId && names.get(categoryId)) || budget?.name || 'Uncategorised',
        spent: Math.max(value, 0),
        allocated: allocatedHere,
        share: spent > 0 ? Math.max(value, 0) / spent : 0,
        status,
        count: countByCategory.get(categoryId) ?? 0,
        lastMonth: Math.max(lastByCategory.get(categoryId) ?? 0, 0),
      }
    })
    .sort((a, b) => b.spent - a.spent || (b.allocated ?? 0) - (a.allocated ?? 0))

  const overRows = rows.filter((r) => r.status === 'over')
  const nearRows = rows.filter((r) => r.status === 'near')
  const overspend = overRows.reduce((sum, r) => sum + r.spent - (r.allocated ?? 0), 0)
  const unbudgetedRows = rows.filter((r) => r.status === 'unbudgeted' && r.spent > 0)
  const unbudgetedSpent = unbudgetedRows.reduce((sum, r) => sum + r.spent, 0)
  const unallocated = total === null ? 0 : Math.max(total - allocated, 0)
  const overAllocated = total === null ? 0 : Math.max(allocated - total, 0)
  const daysLeft = Math.max(daysInMonth - dayOfMonth + 1, 1)
  const projected = Math.round((spent / Math.max(dayOfMonth, 1)) * daysInMonth)
  const idealToday = total === null ? null : Math.round((total * dayOfMonth) / daysInMonth)
  const perDayLeft = total === null ? null : Math.max(Math.floor((total - spent) / daysLeft), 0)

  const insights: Insight[] = []
  const dayWord = (n: number) => `${n} day${n === 1 ? '' : 's'}`
  const shortList = (list: CategoryInsightRow[], max: number) =>
    listNames(list.slice(0, max).map((r) => r.name)) +
    (list.length > max ? ` +${list.length - max}` : '')
  // Below this an amount is noise: 2% of the budget, and never under ₹500.
  const notable = Math.max(total !== null ? total * 0.02 : 0, 50_000)

  // The month as a whole: only when it needs attention (the summary already says what's left).
  if (total !== null && total > 0) {
    if (spent > total) {
      insights.push({
        id: 'month-over',
        tone: 'critical',
        title: 'Over budget',
        value: fmt(spent - total),
        detail: `with ${dayWord(daysLeft)} to go`,
        text: `You're ${fmt(spent - total)} over the ${fmt(total)} budget with ${dayWord(daysLeft)} to go.`,
        visual: { kind: 'share', value: 1 },
      })
    } else if (dayOfMonth < daysInMonth && projected > total) {
      insights.push({
        id: 'month-projected',
        tone: 'warning',
        title: 'Heading over',
        value: `+${fmt(projected - total)}`,
        detail: `by month end · keep to ${fmt(perDayLeft ?? 0)}/day`,
        text: `At this pace you'll spend ${fmt(projected)}, ${fmt(projected - total)} over budget. Keep to ${fmt(perDayLeft ?? 0)} a day to stay within it.`,
        visual: { kind: 'share', value: Math.min(spent / total, 1) },
      })
    } else if (spent > 0 && dayOfMonth < daysInMonth) {
      insights.push({
        id: 'projected-savings',
        tone: 'good',
        title: 'On course to save',
        value: fmt(total - projected),
        detail: 'by month end, if this pace holds',
        text: `At this pace you'll finish the month ${fmt(total - projected)} under budget.`,
        visual: { kind: 'share', value: projected / total },
      })
    }
  }

  // Categories past their allocation, and whether the unallocated budget absorbs it.
  if (overRows.length > 0) {
    const covered = total === null ? 0 : Math.min(unallocated / overspend, 1)
    const effect =
      total === null
        ? ''
        : covered >= 1
          ? ` Your ${fmt(unallocated)} unallocated budget still covers it.`
          : unallocated > 0
            ? ` That's more than the ${fmt(unallocated)} left unallocated, so it eats into other categories.`
            : ' With nothing unallocated, it comes out of other categories.'
    insights.push({
      id: 'categories-over',
      tone: 'critical',
      title: 'Over allocation',
      value: fmt(overspend),
      detail: shortList(overRows, 2),
      text: `${listNames(overRows.map((r) => r.name))} ${overRows.length === 1 ? 'is' : 'are'} ${fmt(overspend)} over ${overRows.length === 1 ? 'its allocation' : 'their allocations'}.${effect}`,
      visual: total === null ? undefined : { kind: 'cover', covered },
    })
  }

  // Categories close to their limit.
  if (nearRows.length > 0) {
    const ratio = (r: CategoryInsightRow) => r.spent / (r.allocated ?? 1)
    const used = Math.max(...nearRows.map(ratio))
    insights.push({
      id: 'categories-near',
      tone: 'warning',
      title: 'Near limit',
      value: `${Math.round(used * 100)}%`,
      detail: shortList(nearRows, 2),
      text: `${listNames(nearRows.map((r) => r.name))} ${nearRows.length === 1 ? 'has' : 'have'} used most of ${nearRows.length === 1 ? 'its allocation' : 'their allocations'} with ${dayWord(daysLeft)} left.`,
      visual: { kind: 'share', value: used },
    })
  }

  // Every budgeted category still within its allocation.
  const budgetedRows = rows.filter((r) => r.allocated !== null)
  if (budgetedRows.length > 0 && overRows.length === 0 && nearRows.length === 0 && spent > 0)
    insights.push({
      id: 'all-within',
      tone: 'good',
      title: 'Within allocation',
      value: `${budgetedRows.length}/${budgetedRows.length}`,
      detail: 'budgeted categories under their limit',
      text: `All ${budgetedRows.length} budgeted categories are within their allocation.`,
    })

  // Money going where no budget was planned: worth a word once it's a real share of spending.
  const unbudgetedShare = spent > 0 ? unbudgetedSpent / spent : 0
  if (unbudgetedSpent > 0 && (unbudgetedSpent >= notable || unbudgetedShare >= 0.2)) {
    const pct = Math.round(unbudgetedShare * 100)
    insights.push({
      id: 'unbudgeted',
      tone: total !== null && unbudgetedSpent >= notable ? 'warning' : 'info',
      title: 'No budget',
      value: fmt(unbudgetedSpent),
      detail: `${pct}% · ${shortList(unbudgetedRows, 1)}`,
      text: `${fmt(unbudgetedSpent)} (${pct}%) went to categories without a budget: ${listNames(unbudgetedRows.map((r) => r.name))}.`,
      visual: { kind: 'share', value: unbudgetedShare },
    })
  }

  // Compared with the same point last month: always shown, only coloured when it matters.
  if (lastMonthToDate > 0 && spent > 0) {
    const diff = spent - lastMonthToDate
    const pct = Math.round((Math.abs(diff) / lastMonthToDate) * 100)
    const matters = pct >= 5 && Math.abs(diff) >= notable
    const same = pct < 5
    insights.push({
      id: 'vs-last-month',
      tone: !matters ? 'info' : diff > 0 ? 'warning' : 'good',
      title: 'vs last month',
      value: same ? 'Same' : `${diff > 0 ? '+' : '−'}${pct}%`,
      detail: same
        ? `${fmt(spent)} by today, as last month`
        : `${fmt(Math.abs(diff))} ${diff > 0 ? 'more' : 'less'} by today`,
      text: same
        ? `About the same as by this day last month (${fmt(lastMonthToDate)}).`
        : `${fmt(Math.abs(diff))} (${pct}%) ${diff > 0 ? 'more' : 'less'} than by this day last month.`,
      visual: { kind: 'compare', before: lastMonthToDate, after: spent },
    })
  }

  // Where most of the money goes, unless the "No budget" tile already names that category alone.
  const top = rows[0]
  const spentCategories = rows.filter((r) => r.spent > 0).length
  const unbudgetedShown = insights.some((i) => i.id === 'unbudgeted')
  const topRepeats = unbudgetedShown && unbudgetedRows.length === 1 && unbudgetedRows[0] === top
  if (top && top.share >= 0.3 && spentCategories > 1 && !topRepeats)
    insights.push({
      id: 'top-category',
      tone: 'info',
      title: 'Biggest category',
      value: `${Math.round(top.share * 100)}%`,
      detail: top.name,
      text: `${top.name} is the biggest category: ${Math.round(top.share * 100)}% of this month's spending.`,
      visual: { kind: 'share', value: top.share },
    })

  // The single largest payment this month.
  const big = largest as Transaction | null
  if (big && spent > 0) {
    const category = (big.category_id && names.get(big.category_id)) || 'Uncategorised'
    const day = Number(big.transaction_date.slice(8, 10))
    insights.push({
      id: 'largest-expense',
      tone: 'info',
      title: 'Largest expense',
      value: fmt(big.amount_minor),
      detail: `${big.title || category} · ${day} ${monthName(month)}`,
      text: `The largest expense this month is ${fmt(big.amount_minor)} on ${big.title || category} (${category}), on ${day} ${monthName(month)}.`,
      visual: { kind: 'share', value: big.amount_minor / spent },
    })
  }

  // Days so far with nothing spent.
  const noSpendDays = Array.from({ length: dayOfMonth }, (_, i) => i + 1).filter(
    (day) => (spendByDay.get(day) ?? 0) <= 0,
  ).length
  if (spent > 0 && noSpendDays >= 2)
    insights.push({
      id: 'no-spend-days',
      tone: 'good',
      title: 'No-spend days',
      value: String(noSpendDays),
      detail: `of ${dayWord(dayOfMonth)} so far`,
      text: `${noSpendDays} of ${dayWord(dayOfMonth)} this month had no spending.`,
      visual: { kind: 'share', value: noSpendDays / dayOfMonth },
    })

  // Late in the month, barely-used allocations could cover the overspend.
  if (overRows.length > 0 && dayOfMonth / daysInMonth >= 0.6) {
    const idle = rows.filter(
      (r) => r.status === 'ok' && r.allocated !== null && r.spent / r.allocated < 0.5,
    )
    const spare = idle.reduce((sum, r) => sum + (r.allocated ?? 0) - r.spent, 0)
    if (idle.length > 0)
      insights.push({
        id: 'idle-allocations',
        tone: 'info',
        title: 'Unused allocation',
        value: fmt(spare),
        detail: shortList(idle, 2),
        text: `${listNames(idle.map((r) => r.name))} ${idle.length === 1 ? 'has' : 'have'} ${fmt(spare)} unused. Moving some of it to the overspent categories would balance them.`,
      })
  }

  if (overAllocated > 0)
    insights.push({
      id: 'over-allocated',
      tone: 'warning',
      title: 'Over-allocated',
      value: fmt(overAllocated),
      detail: 'raise the budget or trim one',
      text: `Allocations are ${fmt(overAllocated)} more than the monthly budget. Raise the budget or trim an allocation.`,
    })

  // Problems first, then wins, then plain information.
  insights.sort((a, b) => TONE_ORDER[a.tone] - TONE_ORDER[b.tone])

  return {
    total,
    spent,
    allocated,
    unallocated,
    overAllocated,
    overspend,
    unbudgetedSpent,
    projected,
    idealToday,
    daysLeft,
    perDayLeft,
    lastMonthToDate,
    rows,
    insights,
  }
}
