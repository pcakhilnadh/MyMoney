import { useState } from 'react'
import type { CurrencyCode } from '@/lib/currency'
import { currencySymbol } from '@/lib/currency'
import { formatCompactMinor, formatMinor, toMinor } from '@/lib/money'

const PRESETS = [10, 20, 25, 50]

/** Whole currency units, so slider and preset amounts stay tidy (e.g. ₹12,000 not ₹11,999.97). */
const fromPercent = (total: number, percent: number) =>
  Math.round((total * percent) / 100 / 100) * 100

/**
 * Sets a category allocation either by typing an amount or by choosing a share of the
 * monthly budget (slider or preset chips). The two stay in sync.
 * `available` is how much of the monthly budget is still unallocated for this category.
 */
export function AllocationInput({
  value,
  onChange,
  total,
  available,
  currency,
  label = 'Monthly limit',
}: {
  value: number
  onChange: (minor: number) => void
  total: number
  available: number
  currency: CurrencyCode
  label?: string
}) {
  const format = (minor: number) => (minor ? (minor / 100).toString() : '')
  // While the field is focused it shows exactly what was typed; otherwise it mirrors `value`,
  // so slider and preset changes show up without an effect.
  const [raw, setRaw] = useState('')
  const [editing, setEditing] = useState(false)

  const percent = total > 0 ? (value / total) * 100 : 0
  const maxPercent = total > 0 ? Math.min(Math.floor((available / total) * 100), 100) : 0
  const over = value > available
  const fillPercent = Math.min(percent, 100)

  function setAmount(minor: number) {
    setEditing(false)
    onChange(minor)
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <label htmlFor="allocation-amount" className="label">
          {label}
        </label>
        <div
          className={`field flex items-center gap-2 !py-2.5 focus-within:!border-primary ${
            over ? '!border-destructive' : ''
          }`}
        >
          <span className="text-lg font-semibold text-muted-foreground">
            {currencySymbol(currency)}
          </span>
          <input
            id="allocation-amount"
            inputMode="decimal"
            placeholder="0"
            aria-invalid={over || undefined}
            value={editing ? raw : format(value)}
            onFocus={() => {
              setRaw(format(value))
              setEditing(true)
            }}
            onBlur={() => setEditing(false)}
            onChange={(event) => {
              setRaw(event.target.value)
              onChange(toMinor(event.target.value))
            }}
            className="money w-full min-w-0 bg-transparent text-xl font-bold outline-none placeholder:text-[#3d3d4a]"
          />
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${
              over ? 'bg-destructive/15 text-destructive' : 'bg-white/10 text-white/80'
            }`}
          >
            {value > 0 ? `${Math.round(percent * 10) / 10}%` : '0%'}
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Share of monthly budget</span>
          <span className="money">{formatCompactMinor(total, currency)}</span>
        </div>
        <input
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(fillPercent)}
          disabled={maxPercent === 0}
          aria-label={`${label} as a percentage of the monthly budget`}
          aria-valuetext={`${Math.round(fillPercent)}% of ${formatMinor(total, currency)}`}
          onChange={(event) => {
            // Dragging can never go past what is left; typing can, and is warned about.
            const next = Math.min(Number(event.target.value), maxPercent)
            setAmount(fromPercent(total, next))
          }}
          className="allocation-slider h-6 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
          style={{
            ['--track' as string]: `linear-gradient(to right, var(--primary) 0%, var(--primary) ${fillPercent}%, rgba(255,255,255,0.22) ${fillPercent}%, rgba(255,255,255,0.22) ${maxPercent}%, rgba(255,255,255,0.07) ${maxPercent}%, rgba(255,255,255,0.07) 100%)`,
          }}
        />
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => {
            const amount = fromPercent(total, preset)
            const fits = amount <= available
            const selected = value > 0 && value === amount
            return (
              <button
                key={preset}
                type="button"
                disabled={!fits}
                aria-pressed={selected}
                title={fits ? undefined : 'More than what is left of the monthly budget'}
                onClick={() => setAmount(amount)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
                  selected
                    ? 'border-primary bg-primary/20 text-white'
                    : 'border-white/15 text-white/75 hover:border-white/30'
                }`}
              >
                {preset}%
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}
