import { Minus, Plus, Trash2, Utensils } from 'lucide-react'
import { Select } from '@/components/kit'
import { units, type Portion, type Unit } from './portions'

function formatAmount(value: number): string {
  return String(Number(value.toFixed(2)))
}

export function MealPortionCard({
  portion,
  onChange,
  onRemove,
  removeLabel,
  estimatedCalories,
}: {
  portion: Portion
  onChange: (update: (portion: Portion) => Portion) => void
  onRemove: () => void
  removeLabel?: string
  estimatedCalories?: number
}) {
  const info = units[portion.unit]
  const numericAmount = Number(portion.amount)
  const validAmount =
    portion.amount.trim() !== '' &&
    Number.isFinite(numericAmount) &&
    numericAmount > 0 &&
    portion.baseAmount !== null
  const decDisabled = !validAmount || numericAmount - info.step <= 0

  return (
    <div className="food-item-card pop-in surface rounded-2xl p-3.5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"
        >
          <Utensils size={19} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold">{portion.food.name}</p>
          {estimatedCalories !== undefined && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              AI estimate: {estimatedCalories} kcal for the scanned portion
            </p>
          )}
          {info.kind !== 'count' &&
            validAmount &&
            portion.unit !== 'g' &&
            portion.unit !== 'ml' && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                ≈ {formatAmount(portion.baseAmount!)} {info.kind === 'mass' ? 'g' : 'ml'} total
                {info.kind === 'volume' ? ' · 1 cup = 250 ml' : ''}
              </p>
            )}
        </div>
        <button
          type="button"
          aria-label={removeLabel ?? `Remove ${portion.food.name}`}
          onClick={onRemove}
          className="tap-scale flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 size={17} />
        </button>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          aria-label={`Decrease ${portion.food.name}`}
          disabled={decDisabled}
          onClick={() =>
            onChange((current) => {
              const amount = Math.max(0, numericAmount - info.step)
              return { ...current, amount: formatAmount(amount), baseAmount: amount * info.factor }
            })
          }
          className="tap-scale surface flex size-10 shrink-0 items-center justify-center rounded-full text-primary disabled:pointer-events-none disabled:opacity-30"
        >
          <Minus size={16} />
        </button>
        <div className="well flex h-10 flex-1 items-center justify-center gap-1.5 rounded-2xl px-2">
          <input
            type="number"
            inputMode="decimal"
            min="0"
            step="any"
            aria-label={`Amount for ${portion.food.name}`}
            value={portion.amount}
            onChange={(event) => {
              const amount = event.target.value
              const value = Number(amount)
              onChange((current) => ({
                ...current,
                amount,
                baseAmount:
                  amount.trim() && Number.isFinite(value)
                    ? value * units[current.unit].factor
                    : null,
              }))
            }}
            className="w-full min-w-0 border-0 bg-transparent text-center text-base font-semibold tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
          {info.kind !== 'count' && (
            <span aria-hidden="true" className="shrink-0 text-sm font-medium text-muted-foreground">
              {info.shortLabel}
            </span>
          )}
        </div>
        <button
          type="button"
          aria-label={`Increase ${portion.food.name}`}
          onClick={() =>
            onChange((current) => {
              const base = validAmount ? numericAmount : 0
              const amount = base + info.step
              return { ...current, amount: formatAmount(amount), baseAmount: amount * info.factor }
            })
          }
          className="tap-scale surface flex size-10 shrink-0 items-center justify-center rounded-full text-primary"
        >
          <Plus size={16} />
        </button>
      </div>
      <Select
        aria-label={`Unit for ${portion.food.name}`}
        alignItemWithTrigger={false}
        value={portion.unit}
        className="mt-2 min-h-11 py-0 font-medium normal-case"
        options={Object.entries(units).map(([value, unit]) => ({ value, label: unit.label }))}
        onValueChange={(value) => {
          const nextUnit = value as Unit
          onChange((current) => {
            const previous = units[current.unit]
            const next = units[nextUnit]
            const baseAmount =
              previous.kind === next.kind
                ? current.baseAmount
                : next.kind === 'mass'
                  ? 100
                  : next.kind === 'volume'
                    ? 250
                    : 1
            const amount = baseAmount === null ? '' : formatAmount(baseAmount / next.factor)
            return { ...current, unit: nextUnit, amount, baseAmount }
          })
        }}
      />
      {!validAmount && (
        <p className="mt-2 text-xs text-destructive">Enter an amount greater than zero.</p>
      )}
    </div>
  )
}
