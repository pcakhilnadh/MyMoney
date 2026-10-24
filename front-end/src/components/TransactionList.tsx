import { useLocation, useNavigate } from 'react-router-dom'
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CornerUpLeft } from 'lucide-react'
import type { Transaction } from '@/db/types'
import { formatMinor } from '@/lib/money'

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
  const days = [
    ...new Set(transactions.map((transaction) => transaction.transaction_date.slice(0, 10))),
  ]

  return (
    <div className="space-y-4">
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
            {transactions
              .filter((transaction) => transaction.transaction_date.startsWith(day))
              .map((transaction) => {
                const kind = TYPE_STYLE[transaction.transaction_type]
                const { Icon } = kind
                return (
                  <button
                    key={transaction.id}
                    type="button"
                    aria-label={`${kind.label}: ${transaction.title}, ${formatMinor(transaction.amount_minor)}`}
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
                      {formatMinor(transaction.amount_minor)}
                    </span>
                  </button>
                )
              })}
          </div>
        </section>
      ))}
    </div>
  )
}
