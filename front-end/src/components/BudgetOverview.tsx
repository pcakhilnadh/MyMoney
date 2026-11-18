import { Link } from 'react-router-dom'
import { Pencil } from 'lucide-react'
import { MetalCard } from '@/components/kit'
import type { CurrencyCode } from '@/lib/currency'
import { formatMinor } from '@/lib/money'

const PALETTE = [
  '#94b0ff',
  '#b69dff',
  '#5ce0ff',
  '#f5ae4b',
  '#7fd8a6',
  '#ff8fa3',
  '#fbbf24',
  '#c4b5fd',
]

export interface AllocationRow {
  id: string
  name: string
  amount: number
  categoryId: string | null
}

const tactile =
  'transition-[transform,box-shadow] duration-150 active:scale-95 active:shadow-[inset_2px_2px_5px_rgba(0,0,0,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
const raised =
  'bg-gradient-to-br from-[#2a3260] to-[#1a2147] shadow-[3px_3px_8px_rgba(0,0,0,0.5),-1px_-1px_4px_rgba(148,176,255,0.1),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[4px_4px_10px_rgba(0,0,0,0.55),-1px_-1px_5px_rgba(148,176,255,0.16),inset_0_1px_0_rgba(255,255,255,0.14)]'

/**
 * The "Budget" view: the monthly budget, how it is split across categories (stacked bar),
 * and a table of each category's share.
 */
export function BudgetOverview({
  total,
  allocated,
  spent,
  rows,
  currency,
  onEdit,
  onAllocate,
}: {
  total: number | null
  allocated: number
  spent: number
  rows: AllocationRow[]
  currency: CurrencyCode
  onEdit: () => void
  onAllocate: () => void
}) {
  const sorted = [...rows].sort((a, b) => b.amount - a.amount)
  const denominator = Math.max(total ?? 0, allocated)
  const share = (amount: number) => (denominator > 0 ? (amount / denominator) * 100 : 0)
  const unallocated = total === null ? 0 : Math.max(total - allocated, 0)
  const overAllocated = total !== null && allocated > total

  return (
    <div className="space-y-4">
      <MetalCard className="space-y-4 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.18em] text-white/50 uppercase">
              Monthly budget
            </p>
            <p className="money mt-1 truncate text-2xl font-bold tracking-tight">
              {total !== null ? formatMinor(total, currency) : 'Not set'}
            </p>
          </div>
          <button
            type="button"
            onClick={onEdit}
            aria-label={total !== null ? 'Edit monthly budget' : 'Set monthly budget'}
            className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold whitespace-nowrap ${raised} ${tactile}`}
          >
            {total !== null ? (
              <>
                <Pencil size={14} aria-hidden="true" />
                Edit
              </>
            ) : (
              'Set monthly budget'
            )}
          </button>
        </div>

        {total !== null ? (
          <>
            <div
              role="img"
              aria-label={`${formatMinor(allocated, currency)} of ${formatMinor(total, currency)} allocated across ${rows.length} categories`}
              className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-[#0a0e1a] p-0.5 shadow-[inset_1px_1px_4px_rgba(0,0,0,0.7),inset_-1px_-1px_2px_rgba(255,255,255,0.05)]"
            >
              {sorted.map((row, index) => (
                <span
                  key={row.id}
                  title={`${row.name} · ${formatMinor(row.amount, currency)}`}
                  className="h-full rounded-full transition-[width] duration-500"
                  style={{
                    width: `${share(row.amount)}%`,
                    backgroundColor: PALETTE[index % PALETTE.length],
                  }}
                />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[
                { label: 'Spent', value: spent },
                { label: 'Allocated', value: allocated },
                { label: 'Unallocated', value: unallocated },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="rounded-xl bg-[#0a0e1a]/70 px-2 py-2 shadow-[inset_1px_1px_4px_rgba(0,0,0,0.55),inset_-1px_-1px_2px_rgba(255,255,255,0.04)]"
                >
                  <p className="text-[10px] text-muted-foreground">{stat.label}</p>
                  <p className="money truncate text-sm font-semibold">
                    {formatMinor(stat.value, currency)}
                  </p>
                </div>
              ))}
            </div>
            {overAllocated && (
              <p className="text-xs text-destructive">
                Allocations exceed the monthly budget by {formatMinor(allocated - total, currency)}.
                Increase the monthly budget.
              </p>
            )}
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Set a monthly budget first, then allocate portions of it to categories.
          </p>
        )}
      </MetalCard>

      {total !== null && (
        <MetalCard className="p-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[11px] font-semibold tracking-[0.18em] text-white/60 uppercase">
              Allocation
            </h2>
            <button
              type="button"
              onClick={onAllocate}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold ${raised} ${tactile}`}
            >
              Allocate
            </button>
          </div>

          {sorted.length === 0 ? (
            <p className="pt-3 text-xs text-muted-foreground">
              No category has a share of the budget yet.
            </p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-[10px] tracking-wider text-white/40 uppercase">
                  <th className="py-1.5 font-medium">Category</th>
                  <th className="py-1.5 text-right font-medium">Amount</th>
                  <th className="w-24 py-1.5 pl-3 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((row, index) => {
                  const color = PALETTE[index % PALETTE.length]
                  const pct = share(row.amount)
                  return (
                    <tr
                      key={row.id}
                      className="border-t border-white/8 transition-colors hover:bg-white/5"
                    >
                      <td className="min-w-0 py-2.5">
                        <Link
                          to={
                            row.categoryId
                              ? `/money/budgets/categories/${row.categoryId}`
                              : '/money/budgets'
                          }
                          className="flex items-center gap-2 font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        >
                          <span
                            aria-hidden="true"
                            className="size-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: color }}
                          />
                          <span className="truncate">{row.name}</span>
                        </Link>
                      </td>
                      <td className="money py-2.5 text-right">
                        {formatMinor(row.amount, currency)}
                      </td>
                      <td className="py-2.5 pl-3">
                        <div className="flex items-center justify-end gap-2">
                          <span className="h-1.5 w-10 overflow-hidden rounded-full bg-white/10">
                            <span
                              className="block h-full rounded-full transition-[width] duration-500"
                              style={{ width: `${Math.min(pct, 100)}%`, backgroundColor: color }}
                            />
                          </span>
                          <span className="w-9 text-right text-xs font-semibold">
                            {Math.round(pct)}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
                {unallocated > 0 && (
                  <tr className="border-t border-white/8 text-muted-foreground">
                    <td className="py-2.5">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden="true"
                          className="size-2.5 shrink-0 rounded-full border border-white/30"
                        />
                        Unallocated
                      </span>
                    </td>
                    <td className="money py-2.5 text-right">
                      {formatMinor(unallocated, currency)}
                    </td>
                    <td className="py-2.5 pl-3 text-right text-xs font-semibold">
                      {Math.round(share(unallocated))}%
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </MetalCard>
      )}
    </div>
  )
}
