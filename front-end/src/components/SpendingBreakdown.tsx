import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { BudgetBar } from '@/components/BudgetBar'
import type { BudgetInsights, CategoryInsightRow } from '@/lib/budget-insights'
import { TEXT_TONES } from '@/lib/budget-tones'
import type { CurrencyCode } from '@/lib/currency'
import { formatShortMinor } from '@/lib/money'

/** Categorical slots in fixed order, validated for the dark card surface (dataviz validator). */
const SLOTS = ['#3987e5', '#d95926', '#199e70', '#c98500', '#d55181', '#9085e9']
const OTHER = 'rgba(255,255,255,0.28)'
const VISIBLE_ROWS = 6

type Group = { key: string; label: string; rows: CategoryInsightRow[]; color?: string }

function trend(row: CategoryInsightRow): string | null {
  if (row.spent <= 0) return null
  if (row.lastMonth <= 0) return 'new this month'
  const change = (row.spent - row.lastMonth) / row.lastMonth
  if (Math.abs(change) < 0.05) return 'same as last month'
  return `${change > 0 ? '↑' : '↓'}${Math.round(Math.abs(change) * 100)}% vs last month`
}

function Row({
  row,
  color,
  currency,
}: {
  row: CategoryInsightRow
  color: string | null
  currency: CurrencyCode
}) {
  const money = (minor: number) => formatShortMinor(minor, currency)
  const diff = Math.abs((row.allocated ?? 0) - row.spent)
  const status =
    row.allocated === null
      ? { text: 'No budget', color: undefined }
      : row.status === 'over'
        ? { text: `${money(diff)} over ${money(row.allocated)}`, color: TEXT_TONES.over }
        : row.status === 'near'
          ? {
              text:
                diff === 0
                  ? `At ${money(row.allocated)} limit`
                  : `${money(diff)} left of ${money(row.allocated)}`,
              color: TEXT_TONES.near,
            }
          : { text: `${money(diff)} left of ${money(row.allocated)}`, color: undefined }
  const meta = [
    row.share > 0 ? `${Math.round(row.share * 100)}%` : null,
    row.count > 0 ? `${row.count} txn${row.count === 1 ? '' : 's'}` : 'nothing spent',
    trend(row),
  ].filter(Boolean)

  const body = (
    <>
      <div className="flex items-baseline justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={
              color ? { background: color } : { boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.3)' }
            }
          />
          <span className="truncate text-[13px] font-medium">{row.name}</span>
        </span>
        <span className="money shrink-0 text-sm font-semibold">{money(row.spent)}</span>
      </div>
      <div className="mt-0.5 flex items-baseline justify-between gap-3 pl-4 text-[11px] text-muted-foreground">
        <span className="min-w-0 truncate">{meta.join(' · ')}</span>
        <span
          className={`money shrink-0 ${status.color ? 'font-semibold' : ''}`}
          style={{ color: status.color }}
        >
          {status.text}
        </span>
      </div>
      {row.allocated !== null && (
        <div className="mt-1.5 pl-4">
          <BudgetBar spent={row.spent} limit={row.allocated} label={`${row.name} budget used`} />
        </div>
      )}
    </>
  )

  const className = '-mx-2 block rounded-xl px-2 py-2'
  return row.categoryId ? (
    <Link
      to={`/money/budgets/categories/${row.categoryId}`}
      aria-label={`${row.name}: ${money(row.spent)} spent, ${status.text}`}
      className={`${className} transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}
    >
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  )
}

/**
 * "Where it's going": a split bar of the month's spending by category, then each category
 * grouped by how it stands against its allocation, with share, activity and the change
 * from the same days last month.
 */
export function SpendingBreakdown({
  data,
  currency,
  action,
}: {
  data: BudgetInsights
  currency: CurrencyCode
  action?: React.ReactNode
}) {
  const [showAll, setShowAll] = useState(false)
  const money = (minor: number) => formatShortMinor(minor, currency)
  const { rows, spent, total } = data

  // Colour follows the category's place in this month's spending; the rest share "Other".
  const spenders = rows.filter((r) => r.spent > 0)
  const colorOf = new Map(spenders.slice(0, SLOTS.length).map((r, i) => [r, SLOTS[i]]))
  const rest = spenders.slice(SLOTS.length)
  const segments = [
    ...spenders
      .slice(0, SLOTS.length)
      .map((r) => ({ key: r.name, share: r.share, color: colorOf.get(r)! })),
    ...(rest.length > 0
      ? [{ key: 'Other', share: rest.reduce((sum, r) => sum + r.share, 0), color: OTHER }]
      : []),
  ]

  const groups: Group[] = [
    {
      key: 'over',
      label: 'Over allocation',
      rows: rows.filter((r) => r.status === 'over'),
      color: TEXT_TONES.over,
    },
    {
      key: 'track',
      label: 'Within allocation',
      rows: rows.filter((r) => r.status === 'ok' || r.status === 'near'),
    },
    { key: 'none', label: 'No budget', rows: rows.filter((r) => r.status === 'unbudgeted') },
  ].filter((g) => g.rows.length > 0)

  // Collapse to the first few rows across groups, problems first.
  let budget = showAll ? Infinity : VISIBLE_ROWS
  const visible = groups
    .map((g) => {
      const shown = g.rows.slice(0, Math.max(budget, 0))
      budget -= shown.length
      return { ...g, shown }
    })
    .filter((g) => g.shown.length > 0)
  const hidden = rows.length - visible.reduce((sum, g) => sum + g.shown.length, 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[11px] font-semibold tracking-[0.18em] text-white/60 uppercase">
            Where it's going
          </h2>
          {spent > 0 && (
            <p className="mt-1 truncate text-[11px] text-muted-foreground">
              <span className="money font-semibold text-foreground/85">{money(spent)}</span> across{' '}
              {spenders.length} {spenders.length === 1 ? 'category' : 'categories'}
            </p>
          )}
        </div>
        {action}
      </div>

      {segments.length > 0 && (
        <div
          role="img"
          aria-label={`Spending split: ${segments.map((s) => `${s.key} ${Math.round(s.share * 100)}%`).join(', ')}`}
          className="flex h-2.5 gap-[2px] overflow-hidden rounded-full"
        >
          {segments.map((s) => (
            <span
              key={s.key}
              title={`${s.key} · ${Math.round(s.share * 100)}%`}
              className="h-full min-w-[3px] first:rounded-l-full last:rounded-r-full"
              style={{ flexGrow: s.share, flexBasis: 0, background: s.color }}
            />
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing spent or allocated this month.</p>
      ) : (
        <div className="space-y-2">
          {visible.map((g) => (
            <section key={g.key} aria-label={g.label}>
              <h3
                className="flex items-center gap-1.5 pt-1 text-[10px] font-semibold tracking-[0.14em] uppercase"
                style={{ color: g.color ?? 'rgba(255,255,255,0.45)' }}
              >
                {g.label}
                <span className="font-medium text-white/35">{g.rows.length}</span>
              </h3>
              <div>
                {g.shown.map((row) => (
                  <Row
                    key={row.categoryId ?? 'none'}
                    row={row}
                    color={colorOf.get(row) ?? (row.spent > 0 ? OTHER : null)}
                    currency={currency}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {(hidden > 0 || showAll) && rows.length > VISIBLE_ROWS && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="flex w-full items-center justify-center gap-1 rounded-xl py-1.5 text-xs font-semibold text-primary hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          {showAll ? 'Show less' : `Show all ${rows.length} categories`}
          <ChevronDown
            size={14}
            aria-hidden="true"
            className={`transition-transform ${showAll ? 'rotate-180' : ''}`}
          />
        </button>
      )}

      {total !== null && data.unallocated > 0 && (
        <p className="border-t border-white/10 pt-2.5 text-[11px] text-muted-foreground">
          <span className="money font-semibold text-foreground/80">{money(data.unallocated)}</span>{' '}
          unallocated
          {data.overspend > 0
            ? `, absorbing ${money(Math.min(data.overspend, data.unallocated))} of overspending`
            : ', a buffer for categories that run over'}
        </p>
      )}
    </div>
  )
}
