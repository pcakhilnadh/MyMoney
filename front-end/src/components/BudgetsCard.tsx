import type { MouseEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Card } from '@/components/kit'
import type { CurrencyCode } from '@/lib/currency'
import { formatCompactMinor } from '@/lib/money'
import type { CategoryBudgetRow } from '@/lib/budget-overview'

// Muted tones so the bars sit back; only the status text carries emphasis.
const OK = 'color-mix(in srgb, var(--primary) 55%, transparent)'
const NEAR = '#c9a45f'
const OVER = '#d9797f'
const NEAR_TEXT = '#e6c879'
const OVER_TEXT = '#f2a0a6'
/** Share of a budget spent that counts as near the limit. */
const NEAR_SHARE = 0.85

/** Compact amount without trailing zeros: ₹1.00K → ₹1K, ₹26.40K → ₹26.4K. */
function money(minor: number, currency: CurrencyCode) {
  return formatCompactMinor(minor, currency).replace(/\.(\d*?)0+(?=[A-Za-z]*$)/, (_, d) =>
    d ? `.${d}` : '',
  )
}

function BudgetRow({ row, currency }: { row: CategoryBudgetRow; currency: CurrencyCode }) {
  const budget = row.budget ?? 0
  const ratio = row.ratio ?? 0
  const over = ratio > 1
  const near = !over && ratio >= NEAR_SHARE
  const pct = Math.round(ratio * 100)
  const diff = Math.abs(budget - row.spent)
  // Over budget the bar is the spend: the tick marks the budget, past it is the overrun.
  const budgetMark = over ? (budget / row.spent) * 100 : 100
  const fill = over ? 100 : ratio * 100

  return (
    <div
      role="group"
      aria-label={`${row.name}, ${money(row.spent, currency)} of ${money(budget, currency)}, ${
        over ? `${money(diff, currency)} over` : `${money(diff, currency)} left`
      }`}
    >
      <div className="flex items-baseline justify-between gap-3 leading-tight">
        <span className="min-w-0 truncate text-[13px] font-medium">{row.name}</span>
        <span className="money shrink-0 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">{money(row.spent, currency)}</span> /{' '}
          {money(budget, currency)}
        </span>
      </div>
      <div className="mt-1.5 flex items-center gap-2.5">
        <div
          role="progressbar"
          aria-label={`${row.name} budget used`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.min(pct, 100)}
          className="relative h-1 flex-1 overflow-hidden rounded-full bg-white/[0.07]"
        >
          <div
            className="absolute inset-y-0 left-0 rounded-full"
            style={{
              width: `${Math.min(fill, budgetMark)}%`,
              background: over ? OK : near ? NEAR : OK,
            }}
          />
          {over && (
            <div
              className="absolute inset-y-0 right-0 rounded-r-full"
              style={{ left: `calc(${budgetMark}% + 2px)`, background: OVER }}
            />
          )}
        </div>
        <span
          className="money w-[76px] shrink-0 text-right text-[11px] leading-none"
          style={{ color: over ? OVER_TEXT : near ? NEAR_TEXT : undefined }}
        >
          {over ? (
            <span className="font-semibold">{money(diff, currency)} over</span>
          ) : (
            <span className={near ? 'font-semibold' : 'text-muted-foreground'}>
              {diff === 0 ? 'At limit' : `${money(diff, currency)} left`}
            </span>
          )}
        </span>
      </div>
    </div>
  )
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
  const overCount = rows.filter((r) => r.ratio !== null && r.ratio > 1).length
  const nearCount = rows.filter(
    (r) => r.ratio !== null && r.ratio <= 1 && r.ratio >= NEAR_SHARE,
  ).length
  const summary = [
    overCount > 0 && { text: `${overCount} over`, color: OVER_TEXT },
    nearCount > 0 && { text: `${nearCount} near limit`, color: NEAR_TEXT },
  ].filter((s): s is { text: string; color: string } => Boolean(s))

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
      <Card className="space-y-3 !px-4 !py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
              Budgets
            </h2>
            {summary.map((s) => (
              <span key={s.text} className="text-[11px] font-medium" style={{ color: s.color }}>
                · {s.text}
              </span>
            ))}
          </div>
          <Link
            to="/money/budgets?view=budget"
            onClick={stop}
            className="shrink-0 text-xs font-semibold text-primary"
          >
            View all
          </Link>
        </div>

        {rows.length === 0 && (
          <p className="text-xs text-muted-foreground">Nothing spent this month yet.</p>
        )}

        {/* The month's top categories by spend, most first, budgeted or not. */}
        {rows.map((row) =>
          row.ratio === null ? (
            <div
              key={row.categoryId ?? 'none'}
              role="group"
              aria-label={`${row.name}, no budget`}
              className="flex items-baseline justify-between gap-3 leading-tight"
            >
              <span className="min-w-0 truncate text-[13px] font-medium">{row.name}</span>
              <span className="flex shrink-0 items-baseline gap-2 text-xs">
                <span className="money font-semibold">{money(row.spent, currency)}</span>
                <Link
                  to="/money/budgets?view=budget"
                  onClick={stop}
                  className="text-[11px] font-semibold text-primary"
                >
                  Set budget
                </Link>
              </span>
            </div>
          ) : (
            <BudgetRow key={row.categoryId ?? 'none'} row={row} currency={currency} />
          ),
        )}
      </Card>
    </div>
  )
}
