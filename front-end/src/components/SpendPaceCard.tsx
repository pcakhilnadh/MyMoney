import { Link } from 'react-router-dom'
import { Card } from '@/components/kit'
import type { CurrencyCode } from '@/lib/currency'
import { formatCompactMinor } from '@/lib/money'
import type { SpendPace } from '@/lib/spend-pace'

const W = 340
const H = 190
const PAD = { left: 6, right: 12, top: 30, bottom: 24 }
const PLOT_W = W - PAD.left - PAD.right
const PLOT_H = H - PAD.top - PAD.bottom

const LINE = '#8aa8ff'
const AMBER = '#f5ae4b'
// The amber of the limit line, faded so the figures sit back into the card.
const SOFT_AMBER = 'rgba(245,174,75,0.72)'
const IDEAL = 'rgba(180,190,230,0.45)'

export function SpendPaceCard({
  pace,
  budget,
  dayOfMonth,
  daysInMonth,
  monthStart,
  currency,
}: {
  pace: SpendPace
  budget: number | null
  dayOfMonth: number
  daysInMonth: number
  /** First day of the displayed month, used to format the projected date. */
  monthStart: Date
  currency: CurrencyCode
}) {
  const { cumulative, spent, ahead, limitDay, limitReached, dailyRate } = pace
  const span = Math.max(daysInMonth - 1, 1)
  // Spending per day is above what the budget allows per day.
  const overPace = budget !== null && budget > 0 && dailyRate > budget / daysInMonth
  const x = (day: number) => PAD.left + ((day - 1) / span) * PLOT_W
  const yMax = budget !== null ? budget * 1.08 : Math.max(spent * 1.25, 1)
  const y = (value: number) =>
    PAD.top + PLOT_H - (Math.min(Math.max(value, 0), yMax) / yMax) * PLOT_H

  const dateLabel = (day: number) =>
    new Date(monthStart.getFullYear(), monthStart.getMonth(), day).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    })

  const points = cumulative.map((value, index) => ({ px: x(index + 1), py: y(value) }))
  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.px},${p.py}`).join(' ')
  const todayPoint = points[points.length - 1]
  const areaPath = `${linePath} L${todayPoint.px},${PAD.top + PLOT_H} L${points[0].px},${
    PAD.top + PLOT_H
  } Z`

  // Projection continues today's average pace to the month's end, clipped at the chart top.
  let projection: { x2: number; y2: number } | null = null
  if (dailyRate > 0 && dayOfMonth < daysInMonth) {
    const endValue = spent + dailyRate * (daysInMonth - dayOfMonth)
    if (endValue <= yMax) projection = { x2: x(daysInMonth), y2: y(endValue) }
    else {
      const dayAtTop = dayOfMonth + (yMax - spent) / dailyRate
      projection = { x2: x(dayAtTop), y2: y(yMax) }
    }
  }

  const headline =
    budget === null
      ? null
      : limitReached && limitDay !== null
        ? `Limit hit on ${dateLabel(limitDay)}`
        : limitDay !== null
          ? `Limit hit on ${dateLabel(limitDay)}`
          : 'Within budget'

  const statusColor = limitDay !== null ? AMBER : '#7fd8a6'

  const youLabel =
    ahead === null
      ? `You · ${formatCompactMinor(spent, currency)}`
      : `You · ${formatCompactMinor(Math.abs(ahead), currency)} ${ahead > 0 ? 'ahead' : 'under'}`
  const anchor = todayPoint.px > W * 0.7 ? 'end' : todayPoint.px < W * 0.2 ? 'start' : 'middle'
  const idealY = budget !== null ? y((budget * (daysInMonth * 0.8)) / daysInMonth) : 0

  return (
    <Card className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="label whitespace-nowrap">Spend vs. pace</div>
        {headline && (
          <span
            className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold"
            style={{ color: statusColor, backgroundColor: `${statusColor}24` }}
          >
            <span
              aria-hidden="true"
              className="size-1.5 rounded-full"
              style={{ backgroundColor: statusColor }}
            />
            {headline}
          </span>
        )}
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        role="img"
        aria-label="Cumulative spending compared with the ideal pace for the monthly budget"
      >
        <defs>
          <linearGradient id="pace-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={LINE} stopOpacity="0.4" />
            <stop offset="100%" stopColor={LINE} stopOpacity="0" />
          </linearGradient>
        </defs>

        {budget !== null && (
          <>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={y(budget)}
              y2={y(budget)}
              stroke={AMBER}
              strokeOpacity="0.7"
              strokeDasharray="1.5 3"
              strokeLinecap="round"
            />
            <text x={PAD.left} y={y(budget) - 5} fontSize="10" fill={AMBER}>
              {formatCompactMinor(budget, currency)} limit
            </text>
            <line
              x1={x(1)}
              y1={y(budget / daysInMonth)}
              x2={x(daysInMonth)}
              y2={y(budget)}
              stroke={IDEAL}
              strokeDasharray="4 3"
            />
            <text x={x(daysInMonth * 0.8)} y={idealY + 16} fontSize="10" fill="#9fb0ee">
              Ideal pace
            </text>
          </>
        )}

        <path d={areaPath} fill="url(#pace-area)" />
        {points.length > 1 && (
          <path
            d={linePath}
            fill="none"
            stroke={LINE}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {projection && (
          <line
            x1={todayPoint.px}
            y1={todayPoint.py}
            x2={projection.x2}
            y2={projection.y2}
            stroke={AMBER}
            strokeWidth="3"
            strokeDasharray="5 4"
            strokeLinecap="round"
          />
        )}
        {budget !== null && limitDay !== null && !limitReached && (
          <circle cx={x(limitDay)} cy={y(budget)} r="5" fill={AMBER} />
        )}

        <circle cx={todayPoint.px} cy={todayPoint.py} r="6" fill="#fff" />
        <text
          x={todayPoint.px}
          y={Math.max(todayPoint.py - 13, 12)}
          fontSize="11"
          fontWeight="500"
          fill="#fff"
          textAnchor={anchor}
        >
          {youLabel}
        </text>

        <text x={PAD.left} y={H - 6} fontSize="10" fill="#8e8ea0">
          1
        </text>
        <text
          x={todayPoint.px}
          y={H - 6}
          fontSize="10"
          fontWeight="600"
          fill="#fff"
          textAnchor={anchor}
        >
          Today
        </text>
        <text x={W - PAD.right} y={H - 6} fontSize="10" fill="#8e8ea0" textAnchor="end">
          {daysInMonth}
        </text>
      </svg>

      <dl
        className={`grid divide-x divide-white/10 border-t border-white/10 pt-3 ${budget === null ? 'grid-cols-2' : 'grid-cols-3'}`}
      >
        <div className="min-w-0 pr-2.5">
          <dt className="text-[11px] text-muted-foreground/80">Spent / day</dt>
          <dd
            className="money mt-0.5 truncate text-sm font-medium text-foreground/70"
            style={overPace ? { color: SOFT_AMBER } : undefined}
          >
            {formatCompactMinor(Math.round(dailyRate), currency)}
          </dd>
          <dd className="text-[10px] text-muted-foreground/60">actual so far</dd>
        </div>
        {budget === null ? (
          <div className="min-w-0 pl-4">
            <Link to="/money/budgets" className="text-xs font-semibold text-primary">
              Set a monthly budget to see your pace
            </Link>
          </div>
        ) : (
          <>
            <div className="min-w-0 px-2.5">
              <dt className="text-[11px] text-muted-foreground">Budget / day</dt>
              <dd className="money mt-0.5 truncate text-sm font-medium text-foreground/70">
                {formatCompactMinor(Math.round(budget / daysInMonth), currency)}
              </dd>
              <dd className="text-[10px] text-muted-foreground/60">to stay within</dd>
            </div>
            <div className="min-w-0 pl-2.5">
              <dt className="text-[11px] text-muted-foreground">Month end</dt>
              <dd
                className="money mt-0.5 truncate text-sm font-medium text-foreground/70"
                style={limitDay !== null ? { color: SOFT_AMBER } : undefined}
              >
                {formatCompactMinor(Math.round(dailyRate * daysInMonth), currency)}
              </dd>
              <dd className="text-[10px] text-muted-foreground/60">at this pace</dd>
            </div>
          </>
        )}
      </dl>
    </Card>
  )
}
