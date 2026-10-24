import { useLiveQuery } from 'dexie-react-hooks'
import { Link } from 'react-router-dom'
import { CalendarDays, ChevronRight, PiggyBank, Sun } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { BarChartCard } from '@/components/kit'
import { DueAlerts } from '@/components/DueAlerts'
import { transactionsRepo } from '@/db/repos'
import { formatCompactMinor } from '@/lib/money'
import { currentDay, currentMonth, dayTotal, monthTotal, monthlySeries } from '@/lib/summary'
import { useCurrency } from '@/money/CurrencyContext'

const greeting = () => {
  const h = new Date().getHours()
  if (h < 12) return { text: 'Good morning', emoji: '🌅' }
  if (h < 17) return { text: 'Good afternoon', emoji: '☀️' }
  return { text: 'Good evening', emoji: '🌙' }
}

const spendingPeriod = () => {
  const now = new Date()
  return {
    today: currentDay(now),
    month: currentMonth(now),
    monthLabel: now.toLocaleString('en-IN', { month: 'long', year: 'numeric' }),
  }
}

export default function Home() {
  const { user } = useAuth()
  const { currency } = useCurrency()
  const txs = useLiveQuery(() => transactionsRepo.list(), []) ?? []
  const period = spendingPeriod()
  const todayTotal = dayTotal(txs, period.today)
  const total = monthTotal(txs, period.month)
  const welcome = greeting()
  const firstName = user?.name?.trim().split(/\s+/)[0]

  return (
    <div className="space-y-5">
      <header className="surface flex items-center justify-between gap-4 overflow-hidden rounded-[28px] border border-primary/10 bg-gradient-to-br from-primary/10 via-card to-positive/10 px-5 py-4">
        <div className="min-w-0">
          <p className="text-sm font-medium text-muted-foreground">{welcome.text}</p>
          <h1 className="mt-1 truncate text-[28px] leading-tight font-bold">
            {firstName ? `${firstName}!` : 'Welcome back!'}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Your money, at a glance.</p>
        </div>
        <span
          aria-hidden="true"
          className="flex size-14 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-[30px] shadow-sm"
        >
          {welcome.emoji}
        </span>
      </header>

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
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full bg-white shadow-[0_0_10px_rgba(255,255,255,0.8)]"
              />
              Spending overview
            </h2>
            <p className="text-xs font-medium text-white/65">{period.monthLabel}</p>
          </div>

          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_1px_minmax(0,1fr)] items-center">
            <div className="min-w-0 pr-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-white/70">
                <Sun size={13} aria-hidden="true" />
                Spent today
              </p>
              <p className="money mt-2 truncate text-[25px] leading-tight font-bold tracking-tight text-white">
                {formatCompactMinor(todayTotal, currency)}
              </p>
            </div>
            <span
              aria-hidden="true"
              className="h-11 w-px bg-gradient-to-b from-white/0 via-white/25 to-white/0"
            />
            <div className="min-w-0 pl-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-white/70">
                <CalendarDays size={13} aria-hidden="true" />
                Spent this month
              </p>
              <p className="money mt-2 truncate text-[25px] leading-tight font-bold tracking-tight text-white">
                {formatCompactMinor(total, currency)}
              </p>
            </div>
          </div>
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
