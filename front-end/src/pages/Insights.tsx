import { useLiveQuery } from 'dexie-react-hooks'
import { BarChartCard, Button, Card, DonutChartCard, PageHeader } from '@/components/kit'
import { db } from '@/db/db'
import { transactionsRepo } from '@/db/repos'
import { formatMinor } from '@/lib/money'
import { byCategory, currentMonth, monthTotal, monthlySeries, toCsv } from '@/lib/summary'

export default function Insights() {
  const txs = useLiveQuery(() => transactionsRepo.list(), []) ?? []
  const cats = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const month = currentMonth()
  const breakdown = byCategory(txs, cats, month)

  function exportCsv() {
    const url = URL.createObjectURL(new Blob([toCsv(txs, cats)], { type: 'text/csv' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `expenses-${month}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Insights" />
      <Card>
        <div className="text-sm text-muted-foreground">Total spent</div>
        <div className="text-3xl font-bold">{formatMinor(monthTotal(txs, month))}</div>
      </Card>
      <BarChartCard
        title="Monthly Spending Trend"
        data={monthlySeries(txs, month).map((p) => ({ ...p, value: p.value / 100 }))}
      />
      {breakdown.length > 0 && (
        <DonutChartCard
          title="Category Breakdown"
          data={breakdown.map((b) => ({ ...b, value: b.value / 100 }))}
        />
      )}
      <Button variant="outline" className="w-full" onClick={exportCsv}>
        Export CSV
      </Button>
    </div>
  )
}
