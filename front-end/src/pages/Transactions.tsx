import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CornerUpLeft, Plus } from 'lucide-react'
import { Input, PageHeader, SegmentedControl } from '@/components/kit'
import { transactionsRepo } from '@/db/repos'
import { formatMinor } from '@/lib/money'

const FILTERS = ['All', 'Personal', 'Groups'] as const
const PAGE_SIZE_MONTHS = 1
const TYPE_STYLE = {
  expense: {
    label: 'Expense',
    Icon: ArrowUpRight,
    color: 'text-destructive',
    surface: 'bg-destructive/10',
    prefix: '−',
  },
  income: {
    label: 'Income',
    Icon: ArrowDownLeft,
    color: 'text-positive',
    surface: 'bg-positive/10',
    prefix: '+',
  },
  refund: {
    label: 'Refund',
    Icon: CornerUpLeft,
    color: 'text-positive',
    surface: 'bg-positive/10',
    prefix: '+',
  },
  transfer: {
    label: 'Transfer',
    Icon: ArrowLeftRight,
    color: 'text-primary',
    surface: 'bg-primary/10',
    prefix: '',
  },
} as const

function monthStart(monthsBack: number): string {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() - monthsBack)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

function nextMonthStart(monthsBack: number): string {
  const date = new Date()
  date.setDate(1)
  date.setMonth(date.getMonth() - monthsBack + 1)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-01`
}

export default function Transactions() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [q, setQ] = useState('')
  const [monthsBack, setMonthsBack] = useState(0)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const startDate = useMemo(() => monthStart(monthsBack), [monthsBack])
  const endDate = useMemo(() => nextMonthStart(0), [])
  const loaded = useLiveQuery(async () => {
    const [transactions, hasOlder] = await Promise.all([
      transactionsRepo.listByDateRange(startDate, endDate),
      transactionsRepo.hasByDateBefore(startDate),
    ])
    return { transactions, hasOlder }
  }, [startDate, endDate])
  const txs = loaded?.transactions ?? []

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !loaded?.hasOlder) return
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting))
          setMonthsBack((current) => current + PAGE_SIZE_MONTHS)
      },
      { rootMargin: '200px' },
    )
    observer.observe(target)
    return () => observer.disconnect()
  }, [loaded?.hasOlder, monthsBack])

  const shown = txs.filter(
    (transaction) =>
      (filter === 'All' ||
        (filter === 'Personal'
          ? transaction.context === 'personal'
          : transaction.context !== 'personal')) &&
      `${transaction.title} ${transaction.merchant ?? ''} ${transaction.long_description ?? ''}`
        .toLowerCase()
        .includes(q.toLowerCase()),
  )
  const days = [...new Set(shown.map((transaction) => transaction.transaction_date.slice(0, 10)))]

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
        onChange={(event) => setQ(event.target.value)}
      />
      <SegmentedControl options={[...FILTERS]} value={filter} onChange={setFilter} />
      {loaded && shown.length === 0 && (
        <p className="py-8 text-center text-muted-foreground">No transactions yet</p>
      )}
      {days.map((day) => (
        <section key={day} className="space-y-1.5">
          <h2 className="label px-1">
            {new Date(day + 'T12:00:00').toLocaleDateString('en-IN', {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
            })}
          </h2>
          <div className="surface divide-y divide-border/60 overflow-hidden rounded-2xl">
            {shown
              .filter((transaction) => transaction.transaction_date.startsWith(day))
              .map((transaction) => {
                const kind = TYPE_STYLE[transaction.transaction_type]
                const { Icon } = kind
                return (
                  <button
                    key={transaction.id}
                    type="button"
                    aria-label={`${kind.label}: ${transaction.title}, ${formatMinor(transaction.amount_minor)}`}
                    onClick={() => navigate(`/transactions/${transaction.id}`)}
                    className="flex min-h-12 w-full min-w-0 items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <span
                      aria-hidden="true"
                      className={`flex size-7 shrink-0 items-center justify-center rounded-full ${kind.surface} ${kind.color}`}
                    >
                      <Icon size={15} strokeWidth={2.2} />
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {transaction.title}
                    </span>
                    <span className={`money shrink-0 text-sm font-semibold ${kind.color}`}>
                      {kind.prefix}
                      {formatMinor(transaction.amount_minor)}
                    </span>
                  </button>
                )
              })}
          </div>
        </section>
      ))}
      {!loaded && <p className="py-8 text-center text-muted-foreground">Loading transactions…</p>}
      {loaded?.hasOlder && (
        <div ref={loadMoreRef} aria-label="Loading older transactions" className="h-2" />
      )}
    </div>
  )
}
