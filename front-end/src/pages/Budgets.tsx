import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  Button,
  CategorySelector,
  CurrencyInput,
  Input,
  ListItem,
  PageHeader,
  SectionTitle,
} from '@/components/kit'
import { db } from '@/db/db'
import { budgetsRepo, transactionsRepo } from '@/db/repos'
import { formatMinor } from '@/lib/money'
import { currentMonth } from '@/lib/summary'

export default function Budgets() {
  const budgets = useLiveQuery(() => budgetsRepo.list(), []) ?? []
  const txs = useLiveQuery(() => transactionsRepo.list(), []) ?? []
  const cats = useLiveQuery(() => db.categories.toArray(), []) ?? []
  const [name, setName] = useState('')
  const [amount, setAmount] = useState(0)
  const [category, setCategory] = useState<string | null>(null)
  const month = currentMonth()

  const spent = (categoryId: string | null) =>
    txs
      .filter(
        (t) =>
          t.transaction_type === 'expense' &&
          t.transaction_date.startsWith(month) &&
          (!categoryId || t.category_id === categoryId),
      )
      .reduce((n, t) => n + t.amount_minor, 0)

  async function add() {
    await budgetsRepo.create({
      group_id: null,
      category_id: cats.find((c) => c.name === category)?.id ?? null,
      name: name.trim() || category || 'Monthly budget',
      amount_minor: amount,
      currency: 'INR',
      period: 'monthly',
      period_start: `${month}-01`,
      period_end: null,
      alert_threshold_percent: 80,
      is_active: true,
    })
    setName('')
    setAmount(0)
    setCategory(null)
  }

  return (
    <div className="space-y-4">
      <PageHeader title="Budgets" />
      {budgets.map((b) => {
        const used = spent(b.category_id)
        const pct = Math.round((used / b.amount_minor) * 100)
        return (
          <div key={b.id} className="space-y-1">
            <ListItem
              title={b.name}
              subtitle={`${formatMinor(used)} of ${formatMinor(b.amount_minor)}`}
              trailing={`${pct}%`}
            />
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full ${pct >= 100 ? 'bg-destructive' : 'bg-primary'}`}
                style={{ width: `${Math.min(pct, 100)}%` }}
              />
            </div>
          </div>
        )
      })}
      <div className="surface space-y-3 rounded-card p-5">
        <SectionTitle>Add Budget</SectionTitle>
        <Input
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <CurrencyInput label="Monthly limit" value={amount} onChange={setAmount} />
        <CategorySelector value={category} onChange={setCategory} />
        <Button className="w-full" disabled={amount <= 0} onClick={add}>
          Add Budget
        </Button>
      </div>
    </div>
  )
}
