import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarCheck,
  ChartPie,
  CircleCheck,
  CircleDashed,
  Flame,
  Gauge,
  Layers,
  OctagonAlert,
  PiggyBank,
  Receipt,
  TrendingUp,
} from 'lucide-react'
import type { Insight, InsightTone, InsightVisual } from '@/lib/budget-insights'

const TONE_COLOR: Record<InsightTone, string> = {
  critical: '#f2878f',
  warning: '#e6c879',
  good: '#7fd8a6',
  info: '#9fb0ee',
}

function iconFor(insight: Insight) {
  switch (insight.id) {
    case 'month-over':
      return OctagonAlert
    case 'month-projected':
      return TrendingUp
    case 'categories-over':
      return Flame
    case 'categories-near':
      return Gauge
    case 'unbudgeted':
      return CircleDashed
    case 'vs-last-month':
      return insight.value.startsWith('+') ? ArrowUpRight : ArrowDownRight
    case 'top-category':
      return ChartPie
    case 'idle-allocations':
    case 'projected-savings':
      return PiggyBank
    case 'all-within':
      return CircleCheck
    case 'no-spend-days':
      return CalendarCheck
    case 'largest-expense':
      return Receipt
    default:
      return Layers
  }
}

function Track({ children }: { children: React.ReactNode }) {
  return <div className="relative h-1 overflow-hidden rounded-full bg-white/[0.07]">{children}</div>
}

function Visual({ visual, color }: { visual: InsightVisual; color: string }) {
  if (visual.kind === 'share')
    return (
      <Track>
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${Math.min(visual.value, 1) * 100}%`, background: color, opacity: 0.75 }}
        />
      </Track>
    )

  if (visual.kind === 'cover') {
    const covered = Math.min(Math.max(visual.covered, 0), 1)
    return (
      <div className="space-y-1">
        <Track>
          <div
            className="absolute inset-y-0 left-0 rounded-l-full"
            style={{ width: `${covered * 100}%`, background: TONE_COLOR.good, opacity: 0.6 }}
          />
          {covered < 1 && (
            <div
              className="absolute inset-y-0 right-0 rounded-r-full"
              style={{
                left: covered > 0 ? `calc(${covered * 100}% + 2px)` : 0,
                background: color,
                opacity: 0.85,
              }}
            />
          )}
        </Track>
        <p className="text-[10px] text-muted-foreground/80">
          {covered >= 1 ? 'Buffer covers it' : `${Math.round(covered * 100)}% covered`}
        </p>
      </div>
    )
  }

  const max = Math.max(visual.before, visual.after, 1)
  return (
    <div className="space-y-1">
      {[
        { label: 'Last', value: visual.before, fill: 'rgba(255,255,255,0.28)' },
        { label: 'Now', value: visual.after, fill: color },
      ].map((bar) => (
        <div key={bar.label} className="flex items-center gap-1.5">
          <span className="w-6 text-[9px] text-muted-foreground/80">{bar.label}</span>
          <div className="flex-1">
            <Track>
              <div
                className="absolute inset-y-0 left-0 rounded-full"
                style={{ width: `${(bar.value / max) * 100}%`, background: bar.fill }}
              />
            </Track>
          </div>
        </div>
      ))}
    </div>
  )
}

/**
 * Insights as a grid of tiles: a tone-coloured icon chip and glow, one big figure, a line of
 * context and a small picture. With an odd count the most important tile spans the full width.
 */
export function InsightTiles({ insights }: { insights: Insight[] }) {
  return (
    <ul className="grid grid-cols-2 gap-2.5">
      {insights.map((insight, index) => {
        const color = TONE_COLOR[insight.tone]
        const Icon = iconFor(insight)
        const wide = index === 0 && insights.length % 2 === 1
        return (
          <li
            key={insight.id}
            aria-label={insight.text}
            className={`relative flex min-w-0 flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-white/[0.03] p-3 ${
              wide ? 'col-span-2' : ''
            }`}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute -top-8 -right-8 size-24 rounded-full blur-2xl"
              style={{ background: color, opacity: 0.12 }}
            />
            <div className="relative flex items-center gap-2">
              <span
                aria-hidden="true"
                className="grid size-7 shrink-0 place-items-center rounded-lg"
                style={{ background: `${color}22`, color }}
              >
                <Icon size={14} />
              </span>
              <span className="truncate text-[11px] font-medium text-muted-foreground">
                {insight.title}
              </span>
            </div>
            <div className="relative mt-2.5 flex flex-1 flex-col">
              <div className="min-w-0">
                <p className="money text-xl leading-tight font-bold tracking-tight">
                  {insight.value}
                </p>
                <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                  {insight.detail}
                </p>
              </div>
              {insight.visual && (
                <div className="mt-auto pt-2.5">
                  <Visual visual={insight.visual} color={color} />
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
