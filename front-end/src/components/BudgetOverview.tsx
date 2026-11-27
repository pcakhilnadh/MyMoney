import { Pencil, Sparkles } from 'lucide-react'
import { BudgetBar } from '@/components/BudgetBar'
import { InsightTiles } from '@/components/InsightTiles'
import { SpendingBreakdown } from '@/components/SpendingBreakdown'
import { TEXT_TONES } from '@/lib/budget-tones'
import { MetalCard } from '@/components/kit'
import type { BudgetInsights } from '@/lib/budget-insights'
import type { CurrencyCode } from '@/lib/currency'
import { formatShortMinor } from '@/lib/money'

const tactile =
  'transition-[transform,box-shadow] duration-150 active:scale-95 active:shadow-[inset_2px_2px_5px_rgba(0,0,0,0.55)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary'
const raised =
  'bg-gradient-to-br from-[#2a3260] to-[#1a2147] shadow-[3px_3px_8px_rgba(0,0,0,0.5),-1px_-1px_4px_rgba(148,176,255,0.1),inset_0_1px_0_rgba(255,255,255,0.1)] hover:shadow-[4px_4px_10px_rgba(0,0,0,0.55),-1px_-1px_5px_rgba(148,176,255,0.16),inset_0_1px_0_rgba(255,255,255,0.14)]'
const sectionTitle = 'text-[11px] font-semibold tracking-[0.18em] text-white/60 uppercase'

function Stat({
  label,
  value,
  hint,
  color,
}: {
  label: string
  value: string
  hint: string
  color?: string
}) {
  return (
    <div className="min-w-0 px-2.5 first:pl-0 last:pr-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="money mt-0.5 truncate text-sm font-semibold" style={{ color }}>
        {value}
      </dd>
      <dd className="truncate text-[10px] text-muted-foreground/70">{hint}</dd>
    </div>
  )
}

/**
 * The "Budget" view: how the month is going against the budget, what stands out, and
 * where the money went category by category against each allocation.
 */
export function BudgetOverview({
  data,
  monthLabel,
  dayOfMonth,
  daysInMonth,
  currency,
  onEdit,
  onAllocate,
}: {
  data: BudgetInsights
  monthLabel: string
  dayOfMonth: number
  daysInMonth: number
  currency: CurrencyCode
  onEdit: () => void
  onAllocate: () => void
}) {
  const money = (minor: number) => formatShortMinor(minor, currency)
  const { total, spent, projected, perDayLeft, lastMonthToDate, insights } = data
  const over = total !== null && spent > total
  const projectedOver = total !== null && projected > total

  return (
    <div className="space-y-4">
      <MetalCard className="p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className={sectionTitle}>{monthLabel}</h2>
            <button
              type="button"
              onClick={onEdit}
              aria-label={total !== null ? 'Edit monthly budget' : 'Set monthly budget'}
              className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${raised} ${tactile}`}
            >
              {total !== null ? (
                <>
                  <Pencil size={12} aria-hidden="true" />
                  Edit budget
                </>
              ) : (
                'Set monthly budget'
              )}
            </button>
          </div>

          <div>
            <p className="flex items-baseline gap-1.5">
              <span className="money text-2xl font-bold tracking-tight">{money(spent)}</span>
              <span className="text-sm text-muted-foreground">
                {total !== null ? <>spent of {money(total)}</> : 'spent this month'}
              </span>
            </p>
            {total !== null && (
              <p
                className="mt-0.5 text-xs font-medium"
                style={{ color: over ? TEXT_TONES.over : undefined }}
              >
                {over ? (
                  `${money(spent - total)} over budget`
                ) : (
                  <span className="text-muted-foreground">
                    <span className="font-semibold text-foreground">{money(total - spent)}</span>{' '}
                    left · day {dayOfMonth} of {daysInMonth}
                  </span>
                )}
              </p>
            )}
          </div>

          {total !== null && (
            <div className="space-y-1">
              <BudgetBar
                spent={spent}
                limit={total}
                marker={dayOfMonth / daysInMonth}
                label="Monthly budget used"
                className="h-2"
              />
              <p className="flex items-center justify-end gap-1.5 text-[10px] text-muted-foreground/70">
                <span aria-hidden="true" className="h-2.5 w-0.5 rounded-full bg-white/60" />
                where an even pace would be today
              </p>
            </div>
          )}

          <dl className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 pt-3">
            <Stat
              label="Per day left"
              value={perDayLeft === null ? '—' : over ? money(0) : money(perDayLeft)}
              hint={total === null ? 'no budget' : `for ${data.daysLeft} days`}
              color={over ? TEXT_TONES.over : undefined}
            />
            <Stat
              label="Month end"
              value={money(projected)}
              hint="at this pace"
              color={projectedOver ? TEXT_TONES.near : undefined}
            />
            {total !== null ? (
              <Stat
                label="Unallocated"
                value={
                  data.overAllocated > 0 ? `−${money(data.overAllocated)}` : money(data.unallocated)
                }
                hint={
                  data.overAllocated > 0 ? 'over-allocated' : `${money(data.allocated)} allocated`
                }
                color={data.overAllocated > 0 ? TEXT_TONES.over : undefined}
              />
            ) : (
              <Stat
                label="Last month"
                value={lastMonthToDate > 0 ? money(lastMonthToDate) : '—'}
                hint="by this day"
              />
            )}
          </dl>

          {total === null && (
            <p className="text-xs text-muted-foreground">
              Set a monthly budget to see what's left, your daily allowance and when you'd run out.
            </p>
          )}
        </div>
      </MetalCard>

      {insights.length > 0 && (
        <MetalCard className="p-4">
          <div className="space-y-3">
            <h2 className={`${sectionTitle} flex items-center gap-2`}>
              <Sparkles size={13} aria-hidden="true" />
              Insights
            </h2>
            <InsightTiles insights={insights} />
          </div>
        </MetalCard>
      )}

      <MetalCard className="p-4">
        <SpendingBreakdown
          data={data}
          currency={currency}
          action={
            total !== null && (
              <button
                type="button"
                onClick={onAllocate}
                className={`shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold ${raised} ${tactile}`}
              >
                Allocate
              </button>
            )
          }
        />
      </MetalCard>
    </div>
  )
}
