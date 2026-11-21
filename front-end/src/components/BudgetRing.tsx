import { Link } from 'react-router-dom'
import type { BudgetRing as BudgetRingData, RingSegment } from '@/lib/budget-ring'
import type { CurrencyCode } from '@/lib/currency'
import { formatCompactMinor } from '@/lib/money'

const SIZE = 200
const STROKE = 22
const RADIUS = (SIZE - STROKE) / 2
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

export function BudgetRing({ ring, currency }: { ring: BudgetRingData; currency: CurrencyCode }) {
  const { segments, budget, spent, safeToday, overBudget } = ring
  let cursor = 0
  const arcs = segments.map((segment) => {
    const start = cursor
    cursor += segment.fraction * CIRCUMFERENCE
    // Round caps extend STROKE/2 past each end; subtract that so arcs meet like the reference.
    const length = Math.max(segment.fraction * CIRCUMFERENCE - STROKE, 0.01)
    return { ...segment, length, offset: start + STROKE / 2 }
  })

  return (
    <div className="relative aspect-square w-full">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="size-full -rotate-90"
        role="img"
        aria-label={
          budget === null
            ? 'Spending by category this month'
            : 'Share of the monthly budget used by each category'
        }
      >
        {budget !== null && (
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            className="text-white/10"
          />
        )}
        {arcs.map((arc) => (
          <circle
            key={arc.name}
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={arc.color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${arc.length} ${CIRCUMFERENCE}`}
            strokeDashoffset={-arc.offset}
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center px-[22%] text-center">
        {budget === null ? (
          <>
            <p className="text-[8px] font-semibold tracking-[0.14em] text-white/60 uppercase">
              Spent
            </p>
            <p className="money text-lg leading-tight font-bold text-white">
              {formatCompactMinor(spent, currency)}
            </p>
            <Link
              to="/money/budgets?view=budget"
              onClick={(e) => e.stopPropagation()}
              className="mt-1 rounded-full bg-white/15 px-2 py-0.5 text-[9px] font-semibold text-white"
            >
              Set budget
            </Link>
          </>
        ) : (
          <>
            <p className="text-[8px] font-semibold tracking-[0.12em] text-white/60 uppercase">
              Safe today
            </p>
            <p
              className={`money text-xl leading-tight font-bold ${
                overBudget ? 'text-[#ffd9dc]' : 'text-white'
              }`}
            >
              {formatCompactMinor(safeToday ?? 0, currency)}
            </p>
            <p className="text-[9px] text-white/60">
              {overBudget
                ? `${formatCompactMinor(spent - budget, currency)} over`
                : `of ${formatCompactMinor(budget, currency)}`}
            </p>
          </>
        )}
      </div>
    </div>
  )
}

export function BudgetRingLegend({
  segments,
  currency,
}: {
  segments: RingSegment[]
  currency: CurrencyCode
}) {
  if (segments.length === 0) return null
  return (
    <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
      {segments.map((segment) => (
        <li key={segment.name} className="flex min-w-0 items-center gap-1.5">
          <span
            aria-hidden="true"
            className="size-2 shrink-0 rounded-full"
            style={{ backgroundColor: segment.color }}
          />
          <span className="max-w-[88px] truncate text-white/75">{segment.name}</span>
          <span className="money font-medium text-white">
            {formatCompactMinor(segment.value, currency)}
          </span>
        </li>
      ))}
    </ul>
  )
}
