import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Card } from '@/components/kit'
import { TYPE_STYLE } from '@/components/TransactionList'
import { db } from '@/db/db'
import { transactionsRepo } from '@/db/repos'
import { formatMinor } from '@/lib/money'
import { useCurrency } from '@/money/CurrencyContext'

const LIMIT = 5

function dayLabel(date: string, now: Date) {
  const day = new Date(`${date.slice(0, 10)}T12:00:00`)
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12)
  const diff = Math.round((today.getTime() - day.getTime()) / 86_400_000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return day.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

/** The last few ledger entries on Home, with a shortcut to the full ledger. */
export function RecentLedger() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { currency } = useCurrency()
  const recent = useLiveQuery(async () => (await transactionsRepo.listByDate()).slice(0, LIMIT), [])
  const cats = useLiveQuery(() => db.categories.toArray(), []) ?? []
  if (!recent) return null
  const categoryName = new Map(cats.map((c) => [c.id, c.name]))
  const now = new Date()

  return (
    <Card className="space-y-1 !px-0 !py-3">
      <div className="flex items-center justify-between gap-3 px-4 pb-1">
        <h2 className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          Recent
        </h2>
        <Link
          to="/money/transactions"
          aria-label="View all transactions"
          className="text-xs font-semibold text-primary"
        >
          View all
        </Link>
      </div>

      {recent.length === 0 ? (
        <p className="px-4 py-3 text-xs text-muted-foreground">
          No transactions yet. Tap + to add your first one.
        </p>
      ) : (
        <ul>
          {recent.map((transaction) => {
            const kind = TYPE_STYLE[transaction.transaction_type]
            const { Icon } = kind
            const category = transaction.category_id
              ? categoryName.get(transaction.category_id)
              : null
            return (
              <li key={transaction.id}>
                <button
                  type="button"
                  aria-label={`${kind.label}: ${transaction.title}, ${formatMinor(transaction.amount_minor, currency)}`}
                  onClick={() => navigate('/money/transactions', { state: { from: pathname } })}
                  className="flex w-full min-w-0 items-center gap-3 px-4 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                >
                  <span
                    aria-hidden="true"
                    className={`flex size-8 shrink-0 items-center justify-center rounded-full ${kind.surface} ${kind.color}`}
                  >
                    <Icon size={15} strokeWidth={2.2} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{transaction.title}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {[category, dayLabel(transaction.transaction_date, now)]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                  <span className={`money shrink-0 text-sm font-semibold ${kind.color}`}>
                    {kind.prefix}
                    {formatMinor(transaction.amount_minor, currency)}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}

    </Card>
  )
}
