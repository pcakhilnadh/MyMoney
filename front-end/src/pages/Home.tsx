import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { CalendarDays, Sun } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { BarChartCard } from '@/components/kit'
import { BudgetsCard } from '@/components/BudgetsCard'
import { topBudgetRows } from '@/lib/budget-overview'
import { DueAlerts } from '@/components/DueAlerts'
import { RecentLedger } from '@/components/RecentLedger'
import { SpendPaceCard } from '@/components/SpendPaceCard'
import { computeSpendPace } from '@/lib/spend-pace'
import { BudgetRing, BudgetRingLegend } from '@/components/BudgetRing'
import { db } from '@/db/db'
import { budgetsRepo, transactionsRepo } from '@/db/repos'
import { computeBudgetRing } from '@/lib/budget-ring'
import { findTotalBudget } from '@/lib/budget'
import { formatCompactMinor } from '@/lib/money'
import { currentDay, currentMonth, dayTotal, monthTotal } from '@/lib/summary'
import { useCurrency } from '@/money/CurrencyContext'

const spendingPeriod = () => {
  const now = new Date()
  return {
    today: currentDay(now),
    month: currentMonth(now),
    monthLabel: now.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
  }
}

const CHART_MONTHS = 6

/** First day (YYYY-MM-DD) of the month `offset` months after `year`/`month` (1-based). */
const monthStart = (year: number, month: number, offset = 0) => {
  const d = new Date(year, month - 1 + offset, 1)
  return `${currentMonth(d)}-01`
}

/** The 6-month chart window ending `pagesBack` windows before this month, read from the index. */
function useMonthlyChart(pagesBack: number) {
  const now = new Date()
  const [y, m] = [now.getFullYear(), now.getMonth() + 1]
  const endOffset = -pagesBack * CHART_MONTHS
  const start = monthStart(y, m, endOffset - (CHART_MONTHS - 1))
  const end = monthStart(y, m, endOffset + 1)
  const totals = useLiveQuery(() => transactionsRepo.monthlyExpenseTotals(start, end), [start, end])
  const hasOlder = useLiveQuery(() => transactionsRepo.hasByDateBefore(start), [start]) ?? false
  const months = Array.from(
    { length: CHART_MONTHS },
    (_, i) => new Date(y, m - 1 + endOffset - (CHART_MONTHS - 1) + i, 1),
  )
  const data = months.map((d) => ({
    name: d.toLocaleString('en', { month: 'short' }),
    value: (totals?.get(currentMonth(d)) ?? 0) / 100,
  }))
  const first = months[0]
  const last = months[months.length - 1]
  const label =
    first.getFullYear() === last.getFullYear()
      ? `${data[0].name} – ${data[data.length - 1].name} ${last.getFullYear()}`
      : `${data[0].name} ${String(first.getFullYear()).slice(2)} – ${data[data.length - 1].name} ${String(last.getFullYear()).slice(2)}`
  return { data, label, hasOlder, key: start }
}

export default function Home() {
  const { currency } = useCurrency()
  const navigate = useNavigate()
  const [pagesBack, setPagesBack] = useState(0)
  const chart = useMonthlyChart(pagesBack)
  const period = spendingPeriod()
  // Every card above the chart is about this month: read just this month from the index.
  const [year, monthNo] = period.month.split('-').map(Number)
  const txs =
    useLiveQuery(
      () => transactionsRepo.listByDateRange(`${period.month}-01`, monthStart(year, monthNo, 1)),
      [period.month],
    ) ?? []
  const budgets = useLiveQuery(() => budgetsRepo.list(), []) ?? []
  const cats = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const todayTotal = dayTotal(txs, period.today)
  const total = monthTotal(txs, period.month)
  const now = new Date()
  const dayOfMonth = now.getDate()
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
  const budgetMinor = findTotalBudget(budgets)?.amount_minor ?? null
  const pace = computeSpendPace({
    txs,
    month: period.month,
    dayOfMonth,
    daysInMonth,
    budget: budgetMinor,
  })
  const ring = computeBudgetRing({
    txs,
    cats,
    month: period.month,
    today: period.today,
    dayOfMonth,
    daysInMonth,
    budget: budgetMinor,
  })

  // Pace needs a budget to compare against and something spent this month.
  const hasTxThisMonth = txs.some((t) => t.transaction_date.startsWith(period.month))

  const budgetRows = topBudgetRows({ txs, cats, budgets, month: period.month, limit: 5 })
  // No monthly budget yet: set one first. With a budget, go straight to allocating it.
  const budgetsPath = `/money/budgets?view=${budgetMinor === null ? 'budget' : 'allocate'}`

  return (
    <div className="space-y-5">
      <section
        className="hero spending-overview cursor-pointer rounded-[26px] px-5 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-labelledby="spending-overview-title"
        role="link"
        tabIndex={0}
        onClick={() => navigate(budgetsPath)}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault()
            navigate(budgetsPath)
          }
        }}
      >
        <div className="relative z-10">
          <div className="flex items-center justify-between gap-3">
            <h2
              id="spending-overview-title"
              className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/70"
            >
              Spending overview
            </h2>
            <p className="text-xs font-medium text-white/65">{period.monthLabel}</p>
          </div>

          <div className="mt-3 grid grid-cols-[148px_minmax(0,1fr)] items-center gap-4">
            <BudgetRing ring={ring} currency={currency} />
            <div className="min-w-0 space-y-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-white/70">
                  <Sun size={12} aria-hidden="true" />
                  Spent today
                </p>
                <p className="money mt-0.5 truncate text-xl leading-tight font-bold tracking-tight text-white">
                  {formatCompactMinor(todayTotal, currency)}
                </p>
              </div>
              <span
                aria-hidden="true"
                className="block h-px bg-gradient-to-r from-white/25 via-white/10 to-white/0"
              />
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-[11px] font-medium text-white/70">
                  <CalendarDays size={12} aria-hidden="true" />
                  Spent this month
                </p>
                <p className="money mt-0.5 truncate text-xl leading-tight font-bold tracking-tight text-white">
                  {formatCompactMinor(total, currency)}
                </p>
                {budgetMinor !== null && (
                  <p className="mt-0.5 truncate text-[11px] text-white/60">
                    of {formatCompactMinor(budgetMinor, currency)} budget
                    {budgetMinor > 0 && ` · ${Math.round((total / budgetMinor) * 100)}%`}
                  </p>
                )}
              </div>
            </div>
          </div>
          <BudgetRingLegend segments={ring.segments} currency={currency} />
        </div>
      </section>

      {budgetMinor !== null && hasTxThisMonth && (
        <SpendPaceCard
          pace={pace}
          budget={budgetMinor}
          dayOfMonth={dayOfMonth}
          daysInMonth={daysInMonth}
          monthStart={new Date(now.getFullYear(), now.getMonth(), 1)}
          currency={currency}
        />
      )}

      <BudgetsCard rows={budgetRows} currency={currency} />

      <BarChartCard
        key={chart.key}
        title={pagesBack === 0 ? 'Last 6 months' : 'Monthly spending'}
        data={chart.data}
        budget={budgetMinor === null ? null : budgetMinor / 100}
        paging={{
          label: chart.label,
          canPrev: chart.hasOlder,
          canNext: pagesBack > 0,
          onPrev: () => setPagesBack((n) => n + 1),
          onNext: () => setPagesBack((n) => Math.max(n - 1, 0)),
        }}
      />
      <DueAlerts />
      <RecentLedger />
    </div>
  )
}
