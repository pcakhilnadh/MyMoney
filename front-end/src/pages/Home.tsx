import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@/auth/AuthContext'
import { BarChartCard } from '@/components/kit'
import { transactionsRepo } from '@/db/repos'
import { formatMinor } from '@/lib/money'
import { currentMonth, monthTotal, monthlySeries } from '@/lib/summary'

const greeting = () => {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

export default function Home() {
  const { user } = useAuth()
  const txs = useLiveQuery(() => transactionsRepo.list(), []) ?? []
  const month = currentMonth()
  const total = monthTotal(txs, month)

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
    </div>
  )
}
