import { useState } from 'react'
import type { ComponentType } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CornerUpLeft, Receipt } from 'lucide-react'
import { AddIconButton, PageHeader } from '@/components/kit'
import { FilterMenu } from '@/components/FilterMenu'
import { MonthSwitcher } from '@/components/MonthSwitcher'
import { TransactionList } from '@/components/TransactionList'
import { transactionsRepo } from '@/db/repos'
import type { TransactionType } from '@/db/types'
import { formatCompactMinor, formatMinor } from '@/lib/money'
import { formatMonth, monthKey, shiftMonth } from '@/lib/months'
import { useCurrency } from '@/money/CurrencyContext'

const FILTERS = ['All', 'Personal', 'Groups'] as const

function SummaryStat({
  label,
  amount,
  color,
  Icon,
}: {
  label: string
  amount: number
  color: string
  Icon: ComponentType<{ size?: number; strokeWidth?: number }>
}) {
  const { currency } = useCurrency()
  const empty = amount === 0

  return (
    <div
      role="group"
      aria-label={`${label}: ${formatMinor(amount, currency)}`}
      title={formatMinor(amount, currency)}
      className="min-w-0 space-y-0.5 px-3 first:pl-0 last:pr-0"
    >
      <div
        className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wide ${empty ? 'text-white/60' : color}`}
      >
        <Icon size={12} strokeWidth={2.4} />
        {label}
      </div>
      <div
        className={`money truncate text-base leading-tight font-bold ${empty ? 'text-white/60' : color}`}
      >
        {formatCompactMinor(amount, currency)}
      </div>
    </div>
  )
}

export default function Transactions() {
  const navigate = useNavigate()
  const [filter, setFilter] = useState<(typeof FILTERS)[number]>('All')
  const [currentMonth] = useState(() => monthKey(new Date()))
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const startDate = `${selectedMonth}-01`
  const endDate = `${shiftMonth(selectedMonth, 1)}-01`
  const loaded = useLiveQuery(
    () => transactionsRepo.listByDateRange(startDate, endDate),
    [startDate, endDate],
  )
  const shown = (loaded ?? []).filter(
    (transaction) =>
      filter === 'All' ||
      (filter === 'Personal'
        ? transaction.context === 'personal'
        : transaction.context !== 'personal'),
  )
  const monthLabel = formatMonth(selectedMonth)
  const totals = shown.reduce<Record<TransactionType, number>>(
    (sum, transaction) => {
      sum[transaction.transaction_type] += transaction.amount_minor
      return sum
    },
    { expense: 0, income: 0, refund: 0, transfer: 0 },
  )
  const netSpend = totals.expense - totals.refund
  const isNetRefund = netSpend < 0

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <PageHeader title="Transactions" />
        <AddIconButton label="Add transaction" onClick={() => navigate('/money/expenses/new')} />
      </div>

      <section className="hero relative overflow-visible rounded-lg after:rounded-[inherit]">
        <div className="relative z-20 px-4 pt-3.5 pb-3">
          <MonthSwitcher
            value={selectedMonth}
            max={currentMonth}
            prev={shiftMonth(selectedMonth, -1)}
            next={shiftMonth(selectedMonth, 1)}
            onChange={setSelectedMonth}
            trailing={
              <FilterMenu
                label="Filter transactions"
                options={FILTERS}
                value={filter}
                onChange={setFilter}
              />
            }
          />
        </div>
        <div
          role="group"
          aria-label="Monthly transaction summary"
          className="relative z-10 grid grid-cols-3 divide-x divide-white/15 rounded-b-lg border-t border-white/15 bg-[#050b1a]/55 px-4 py-3"
        >
          <SummaryStat
            label={isNetRefund ? 'Refunded' : 'Spent'}
            amount={Math.abs(netSpend)}
            color={isNetRefund ? 'text-[#4ae3b5]' : 'text-[#ff8b94]'}
            Icon={isNetRefund ? CornerUpLeft : ArrowUpRight}
          />
          <SummaryStat
            label="Income"
            amount={totals.income}
            color="text-[#4ae3b5]"
            Icon={ArrowDownLeft}
          />
          <SummaryStat
            label="Transfers"
            amount={totals.transfer}
            color="text-[#8db4ff]"
            Icon={ArrowLeftRight}
          />
        </div>
      </section>

      {!loaded && <p className="py-10 text-center text-muted-foreground">Loading transactions…</p>}
      {loaded && shown.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <span
            aria-hidden="true"
            className="flex size-14 items-center justify-center rounded-full bg-muted/50 text-muted-foreground"
          >
            <Receipt size={26} />
          </span>
          <p className="font-medium">
            No {filter === 'All' ? '' : `${filter.toLowerCase()} `}transactions in {monthLabel}
          </p>
          {selectedMonth === currentMonth && filter === 'All' && (
            <button
              type="button"
              onClick={() => navigate('/money/expenses/new')}
              className="text-sm font-medium text-primary"
            >
              Add your first one
            </button>
          )}
        </div>
      )}
      {shown.length > 0 && <TransactionList transactions={shown} />}
    </div>
  )
}
