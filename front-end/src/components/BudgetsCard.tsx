import type { MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '@/components/kit'
import type { CurrencyCode } from '@/lib/currency'
import { formatCompactMinor } from '@/lib/money'
import type { CategoryBudgetRow } from '@/lib/budget-overview'

const OVER = '#ff8f3a'
const WARN = '#fbbf24'
const OK = '#94b0ff'

/** Compact amount without trailing zeros: ₹1.00K → ₹1K, ₹26.40K → ₹26.4K. */
function money(minor: number, currency: CurrencyCode) {
  return formatCompactMinor(minor, currency).replace(/\.(\d*?)0+(?=[A-Za-z]*$)/, (_, d) =>
    d ? `.${d}` : '',
  )
}

function tone(ratio: number) {
  if (ratio > 1) return OVER
  if (ratio >= 0.8) return WARN
  return OK
}

export function BudgetsCard({
  rows,
  currency,
}: {
  rows: CategoryBudgetRow[]
  currency: CurrencyCode
}) {
  const navigate = useNavigate()
  const stop = (e: MouseEvent) => e.stopPropagation()

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label="Open budget breakdown"
      className="cursor-pointer rounded-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      onClick={() => navigate('/money/budgets?view=budget')}
      onKeyDown={(e) => {
        if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          navigate('/money/budgets?view=budget')
        }
      }}
    >
      <Card className="space-y-2.5 !px-4 !py-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Budgets
          </h2>
          <Link
            to="/money/budgets?view=budget"
            onClick={stop}
            className="text-xs font-semibold text-primary"
          >
            View all
          </Link>
        </div>

        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground">Nothing spent this month yet.</p>
        )}

        {/* The month's top categories by spend, most first, budgeted or not. */}
        {rows.map((row) => {
          if (row.ratio === null)
            return (
              <div
                key={row.categoryId ?? 'none'}
                role="group"
                aria-label={`${row.name}, no budget`}
                className="flex items-center justify-between gap-3"
              >
                <p className="min-w-0 truncate text-xs text-muted-foreground">
                  <span className="text-sm font-semibold text-foreground">{row.name}</span>{' '}
                  <span className="money">{money(row.spent, currency)}</span> · no budget
                </p>
                <Link
                  to="/money/budgets?view=budget"
                  onClick={stop}
                  className="shrink-0 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold"
                >
                  Set budget
                </Link>
              </div>
            )
          const ratio = row.ratio
          const color = tone(ratio)
          const pct = Math.round(ratio * 100)
          return (
            <div key={row.categoryId ?? 'none'}>
              <div className="flex items-baseline justify-between gap-3 leading-tight">
                <span className="min-w-0 truncate text-sm font-semibold">{row.name}</span>
                <span className="flex shrink-0 items-center gap-2">
                  <span className="money text-xs">
                    <b
                      className="text-sm font-bold"
                      style={{ color: ratio >= 0.8 ? color : undefined }}
                    >
                      {money(row.spent, currency)}
                    </b>
                    <span className="text-muted-foreground">
                      {' '}
                      / {money(row.budget ?? 0, currency)}
                    </span>
                  </span>
                  <span
                    className="rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none"
                    style={{ color, backgroundColor: `${color}26` }}
                  >
                    {ratio > 1 ? `+${pct - 100}%` : `${pct}%`}
                  </span>
                </span>
              </div>
              <div
                role="progressbar"
                aria-label={`${row.name} budget used`}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.min(pct, 100)}
                className="mt-1 h-1.5 overflow-hidden rounded-full bg-white/10"
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(ratio, 1) * 100}%`,
                    backgroundImage: `linear-gradient(90deg, ${color}99, ${color})`,
                  }}
                />
              </div>
            </div>
          )
        })}
      </Card>
    </div>
  )
}
