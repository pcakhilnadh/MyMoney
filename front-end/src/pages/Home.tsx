import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { ChevronRight } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { BarChartCard, EmptyState, ListItem, SectionTitle } from '@/components/kit'
import { db } from '@/db/db'
import { transactionsRepo } from '@/db/repos'
import { formatMinor } from '@/lib/money'
import { byCategory, currentMonth, monthTotal, monthlySeries } from '@/lib/summary'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Home() {
  const { user } = useAuth()
  const txs = useLiveQuery(() => transactionsRepo.list(), []) ?? []
  const cats = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const month = currentMonth()
  const total = monthTotal(txs, month)
  const top = byCategory(txs, cats, month).slice(0, 4)

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm text-muted-foreground">{greeting()}</p>
        <h1 className="text-[28px] leading-tight font-bold">{user?.name?.split(' ')[0]}</h1>
      </header>

      <div className="hero rounded-[28px] p-6">
        <div className="text-sm font-medium text-white/75">Spent this month</div>
        <div className="money mt-1 text-[44px] leading-none font-extrabold text-white">
          {formatMinor(total)}
        </div>
        <div className="mt-4 text-xs text-white/70">
          {new Date().toLocaleString('en-IN', { month: 'long', year: 'numeric' })}
        </div>
      </div>

      <BarChartCard
        title="Last 6 months"
        data={monthlySeries(txs, month).map((p) => ({ ...p, value: p.value / 100 }))}
      />

      <section className="space-y-2.5">
        <SectionTitle>Top categories</SectionTitle>
        {top.length === 0 && (
          <EmptyState>No spending yet. Tap + to add your first expense.</EmptyState>
        )}
        {top.map((c) => (
          <ListItem
            key={c.name}
            title={c.name}
            subtitle={`${Math.round((c.value / total) * 100)}% of spending`}
            trailing={formatMinor(c.value)}
          />
        ))}
      </section>

      <Link
        to="/budgets"
        className="surface flex items-center justify-between rounded-2xl px-4 py-3.5 font-medium"
      >
        Budgets
        <ChevronRight size={18} className="text-muted-foreground" />
      </Link>
    </div>
  )
}
