import { BAR_TONES } from '@/lib/budget-tones'

/**
 * A thin spend-vs-limit bar. Over the limit the bar is the spend: a 2px gap marks where the
 * limit ends and the overrun continues in coral. Without a limit it shows `share` (0-1) in grey.
 * `marker` (0-1 of the limit) draws a faint tick, such as where an even pace would be today.
 */
export function BudgetBar({
  spent,
  limit,
  share,
  marker,
  label,
  className = 'h-1',
}: {
  spent: number
  limit: number | null
  share?: number
  marker?: number | null
  label: string
  className?: string
}) {
  const ratio = limit && limit > 0 ? spent / limit : null
  const over = ratio !== null && ratio > 1
  const near = ratio !== null && !over && ratio >= 0.85
  const limitAt = over ? (limit! / spent) * 100 : 100
  const fill = ratio === null ? (share ?? 0) * 100 : over ? limitAt : ratio * 100
  const pct = ratio === null ? 0 : Math.round(ratio * 100)

  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.min(pct, 100)}
      className={`relative overflow-hidden rounded-full bg-white/[0.07] ${className}`}
    >
      <div
        className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-500"
        style={{
          width: `${Math.max(fill, 0)}%`,
          background: ratio === null ? BAR_TONES.none : near ? BAR_TONES.near : BAR_TONES.ok,
        }}
      />
      {over && (
        <div
          className="absolute inset-y-0 right-0 rounded-r-full"
          style={{ left: `calc(${limitAt}% + 2px)`, background: BAR_TONES.over }}
        />
      )}
      {marker != null && marker > 0 && marker < 1 && (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 w-0.5 bg-white/60"
          style={{ left: `calc(${(over ? marker * limitAt : marker * 100).toFixed(2)}% - 1px)` }}
        />
      )}
    </div>
  )
}
