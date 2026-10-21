import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Trash2 } from 'lucide-react'
import { Input, ListItem, PageHeader, SegmentedControl } from '@/components/kit'
import { db } from '@/db/db'
import { transactionsRepo } from '@/db/repos'
import { formatMinor } from '@/lib/money'

const FILTERS = ['All', 'Personal', 'Family', 'Groups'] as const
const CTX = { Personal: 'personal', Family: 'family', Groups: 'group' } as const

export default function Transactions() {
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [q, setQ] = useState('')
  const txs = useLiveQuery(() => transactionsRepo.listByDate(), [])
  const cats = useLiveQuery(() => db.categories.toArray(), [])
  const names = new Map(cats?.map((c) => [c.id, c.name]))

  const shown = (txs ?? []).filter(
    (t) =>
      (filter === 'All' || t.context === CTX[filter]) &&
      `${t.description} ${t.merchant ?? ''}`.toLowerCase().includes(q.toLowerCase()),
  )
  const days = [...new Set(shown.map((t) => t.transaction_date.slice(0, 10)))]

  return (
    <div className="space-y-4">
      <PageHeader title="Transactions" />
      <Input
        placeholder="Search transactions or merchants"
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <SegmentedControl options={[...FILTERS]} value={filter} onChange={setFilter} />
      {txs && shown.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">No transactions yet</p>
      )}
      {days.map((day) => (
        <section key={day} className="space-y-2">
          <h2 className="label px-1">
            {new Date(day + 'T12:00:00').toLocaleDateString('en-IN', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </h2>
          {shown
            .filter((t) => t.transaction_date.startsWith(day))
            .map((t) => (
              <ListItem
                key={t.id}
                title={t.description}
                subtitle={(t.category_id && names.get(t.category_id)) || 'Uncategorised'}
                trailing={
                  <span className="flex items-center gap-3">
                    {formatMinor(t.amount_minor)}
                    <button
                      aria-label={`Delete ${t.description}`}
                      onClick={() => transactionsRepo.remove(t.id)}
                      className="text-muted-foreground"
                    >
                      <Trash2 size={16} />
                    </button>
                  </span>
                }
              />
            ))}
        </section>
      ))}
    </div>
  )
}
