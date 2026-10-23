import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, Plus, Trash2 } from 'lucide-react'
import { Input, PageHeader, SegmentedControl } from '@/components/kit'
import { db } from '@/db/db'
import { transactionsRepo } from '@/db/repos'
import { formatMinor } from '@/lib/money'

const FILTERS = ['All', 'Personal', 'Groups'] as const
const TYPE_STYLE = {
  debit: {
    label: 'Debit',
    Icon: ArrowUpRight,
    color: 'text-destructive',
    surface: 'bg-destructive/10',
  },
  credit: {
    label: 'Credit',
    Icon: ArrowDownLeft,
    color: 'text-positive',
    surface: 'bg-positive/10',
  },
  transfer: {
    label: 'Transfer',
    Icon: ArrowLeftRight,
    color: 'text-primary',
    surface: 'bg-primary/10',
  },
} as const

export default function Transactions() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [q, setQ] = useState('')
  const txs = useLiveQuery(() => transactionsRepo.listByDate(), [])
  const cats = useLiveQuery(() => db.categories.toArray(), [])
  const accounts = useLiveQuery(() => db.accounts.toArray(), [])
  const names = new Map(cats?.map((c) => [c.id, c.name]))
  const accountNames = new Map(accounts?.map((account) => [account.id, account.name]))

  const shown = (txs ?? []).filter(
    (t) =>
      (filter === 'All' ||
        (filter === 'Personal' ? t.context === 'personal' : t.context !== 'personal')) &&
      `${t.description} ${t.merchant ?? ''}`.toLowerCase().includes(q.toLowerCase()),
  )
  const days = [...new Set(shown.map((t) => t.transaction_date.slice(0, 10)))]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Transactions" />
        <button
          type="button"
          aria-label="Add transaction"
          onClick={() => navigate('/expenses/new')}
          className="gloss flex size-10 items-center justify-center rounded-full text-primary-foreground"
        >
          <Plus size={21} />
        </button>
      </div>
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
            .map((t) => {
              const kind =
                t.transaction_type === 'income' || t.transaction_type === 'refund'
                  ? TYPE_STYLE.credit
                  : t.transaction_type === 'transfer'
                    ? TYPE_STYLE.transfer
                    : TYPE_STYLE.debit
              const { Icon } = kind
              const categoryName = t.category_id ? names.get(t.category_id) : undefined
              const detail =
                t.transaction_type === 'transfer'
                  ? [
                      categoryName,
                      `${accountNames.get(t.account_id) ?? 'Account'} → ${accountNames.get(t.transfer_to_account_id ?? '') ?? 'Account'}`,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : [
                      categoryName || 'Uncategorised',
                      accountNames.get(t.account_id) ?? 'Account',
                    ].join(' · ')
              const amountPrefix =
                kind === TYPE_STYLE.debit ? '−' : kind === TYPE_STYLE.credit ? '+' : ''
              return (
                <article
                  key={t.id}
                  className="surface flex min-w-0 items-center gap-3 rounded-2xl px-3.5 py-3"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-10 shrink-0 items-center justify-center rounded-full ${kind.surface} ${kind.color}`}
                  >
                    <Icon size={19} strokeWidth={2.2} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-semibold">{t.description}</div>
                    <div className="mt-0.5 truncate text-xs text-muted-foreground">{detail}</div>
                    <span
                      className={`mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] leading-none font-semibold ${kind.surface} ${kind.color}`}
                    >
                      {kind.label}
                      {t.transaction_type === 'transfer' && categoryName
                        ? ` · ${categoryName}`
                        : ''}
                    </span>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className={`money text-sm font-bold ${kind.color}`}>
                      {amountPrefix}
                      {formatMinor(t.amount_minor)}
                    </span>
                    <button
                      aria-label={`Delete ${t.description}`}
                      onClick={() => {
                        if (window.confirm(`Delete "${t.description}"?`))
                          void transactionsRepo.remove(t.id)
                      }}
                      className="text-muted-foreground"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </article>
              )
            })}
        </section>
      ))}
    </div>
  )
}
