import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { AddIconButton, Input, PageHeader, SegmentedControl } from '@/components/kit'
import { TransactionList } from '@/components/TransactionList'
import { transactionsRepo } from '@/db/repos'

const FILTERS = ['All', 'Personal', 'Groups'] as const
const PAGE_SIZE_MONTHS = 1

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
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <PageHeader title="Transactions" />
        <AddIconButton
          label="Add transaction"
          onClick={() => navigate('/expenses/new')}
        />
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
      {shown.length > 0 && <TransactionList transactions={shown} />}
      {!loaded && <p className="py-8 text-center text-muted-foreground">Loading transactions…</p>}
      {loaded?.hasOlder && (
        <div ref={loadMoreRef} aria-label="Loading older transactions" className="h-2" />
      )}
    </div>
  )
}
