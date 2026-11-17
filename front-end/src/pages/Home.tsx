import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronRight, PiggyBank, Sun } from 'lucide-react'
import { BarChartCard } from '@/components/kit'
import { DueAlerts } from '@/components/DueAlerts'
import { BudgetRing, BudgetRingLegend } from '@/components/BudgetRing'
import { db } from '@/db/db'
import { budgetsRepo, transactionsRepo } from '@/db/repos'
import { computeBudgetRing } from '@/lib/budget-ring'
import { findTotalBudget } from '@/lib/budget'
import { formatCompactMinor } from '@/lib/money'
import { currentDay, currentMonth, dayTotal, monthTotal, monthlySeries } from '@/lib/summary'
import { useCurrency } from '@/money/CurrencyContext'

const spendingPeriod = () => {
  const now = new Date()
  return {
    today: currentDay(now),
    month: currentMonth(now),
    monthLabel: now.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
  }
}

export default function Home() {
  const { currency } = useCurrency()
  const txs = useLiveQuery(() => transactionsRepo.list(), []) ?? []
  const budgets = useLiveQuery(() => budgetsRepo.list(), []) ?? []
  const cats = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const period = spendingPeriod()
  const todayTotal = dayTotal(txs, period.today)
  const total = monthTotal(txs, period.month)
  const now = new Date()
  const ring = computeBudgetRing({
    txs,
    cats,
    month: period.month,
    today: period.today,
    dayOfMonth: now.getDate(),
    daysInMonth: new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate(),
    budget: findTotalBudget(budgets)?.amount_minor ?? null,
  })

  return (
    <div className="space-y-5">
      <section
        className="hero spending-overview rounded-[26px] px-5 py-4"
        aria-labelledby="spending-overview-title"
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
              </div>
            </div>
          </div>
          <BudgetRingLegend segments={ring.segments} currency={currency} />
        </div>
      </section>

      <BarChartCard
        title="Last 6 months"
        data={monthlySeries(txs, period.month).map((p) => ({ ...p, value: p.value / 100 }))}
      />
      <Link
        to="/money/budgets"
        className="surface flex items-center gap-3 rounded-2xl px-4 py-3.5 font-medium"
      >
        <span className="flex size-9 items-center justify-center rounded-xl bg-secondary text-primary">
          <PiggyBank size={18} />
        </span>
        <span className="flex-1">View budgets</span>
        <ChevronRight size={18} className="text-muted-foreground" />
      </Link>
      <DueAlerts />
    </div>
  )
}
