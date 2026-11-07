import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CornerUpLeft } from 'lucide-react'
import type { Transaction } from '@/db/types'
import { formatCompactMinor, formatMinor } from '@/lib/money'
import { useCurrency } from '@/money/CurrencyContext'

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

export function TransactionList({ transactions }: { transactions: Transaction[] }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { currency } = useCurrency()
  const days = new Map<string, Transaction[]>()
  for (const transaction of transactions) {
    const day = transaction.transaction_date.slice(0, 10)
    const dayTransactions = days.get(day)
    if (dayTransactions) dayTransactions.push(transaction)
    else days.set(day, [transaction])
  }

  return (
    <div className="space-y-4">
      {[...days].map(([day, dayTransactions]) => {
        const totals = dayTransactions.reduce(
          (sum, transaction) => {
            sum[transaction.transaction_type] += transaction.amount_minor
            return sum
          },
          { expense: 0, income: 0, refund: 0, transfer: 0 },
        )
        const netSpend = totals.expense - totals.refund
        const netSpendLabel = netSpend < 0 ? 'Net refund' : 'Net spend'
        const NetSpendIcon = netSpend < 0 ? CornerUpLeft : ArrowUpRight
        const netSpendColor = netSpend < 0 ? 'text-positive' : 'text-destructive'
        const netSpendAmount = Math.abs(netSpend)
        const formattedDay = new Date(day + 'T12:00:00').toLocaleDateString('en-IN', {
          weekday: 'short',
          day: 'numeric',
          month: 'short',
        })

        return (
          <section key={day} className="space-y-1.5">
            <h2 className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-1">
              <span className="label">{formattedDay}</span>
              <span
                role="group"
                aria-label={`Daily totals for ${formattedDay}`}
                className="ml-auto flex flex-wrap items-center justify-end gap-x-2.5 gap-y-1"
              >
                {netSpendAmount > 0 && (
                  <span
                    aria-label={`${netSpendLabel}: ${formatMinor(netSpendAmount, currency)}`}
                    title={`${netSpendLabel}: ${formatMinor(netSpendAmount, currency)}`}
                    className={`inline-flex items-center gap-1 text-xs font-medium ${netSpendColor}`}
                  >
                    <NetSpendIcon aria-hidden="true" size={13} strokeWidth={2.2} />
                    {formatCompactMinor(netSpendAmount, currency)}
                  </span>
                )}
                {totals.income > 0 && (
                  <span
                    aria-label={`Income: ${formatMinor(totals.income, currency)}`}
                    title={`Income: ${formatMinor(totals.income, currency)}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-positive"
                  >
                    <ArrowDownLeft aria-hidden="true" size={13} strokeWidth={2.2} />
                    {formatCompactMinor(totals.income, currency)}
                  </span>
                )}
                {totals.transfer > 0 && (
                  <span
                    aria-label={`Transfers: ${formatMinor(totals.transfer, currency)}`}
                    title={`Transfers: ${formatMinor(totals.transfer, currency)}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary"
                  >
                    <ArrowLeftRight aria-hidden="true" size={13} strokeWidth={2.2} />
                    {formatCompactMinor(totals.transfer, currency)}
                  </span>
                )}
              </span>
            </h2>
            <div className="surface divide-y divide-border/60 overflow-hidden rounded-2xl">
              {dayTransactions.map((transaction) => {
                const kind = TYPE_STYLE[transaction.transaction_type]
                const { Icon } = kind
                return (
                  <button
                    key={transaction.id}
                    type="button"
                    aria-label={`${kind.label}: ${transaction.title}, ${formatMinor(transaction.amount_minor, currency)}`}
                    onClick={() =>
                      navigate(`/money/transactions/${transaction.id}`, {
                        state: { from: pathname },
                      })
                    }
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
                      {formatMinor(transaction.amount_minor, currency)}
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}
