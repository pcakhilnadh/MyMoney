import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, Loader2, Minus, Plus, ScanLine, Search, Trash2, Utensils, X } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { api } from '@/auth/api'
import { Button, PageHeader, Select } from '@/components/kit'
import { ImageCapture } from '@/components/kit/ImageCapture'

interface Food {
  id: string
  name: string
}

type Unit = 'g' | 'kg' | 'ml' | 'litre' | 'tsp' | 'tbsp' | 'cup' | 'count'
interface Portion {
  food: Food
  amount: string
  unit: Unit
  baseAmount: number | null
}

const units: Record<
  Unit,
  { label: string; shortLabel: string; kind: 'mass' | 'volume' | 'count'; factor: number; step: number }
> = {
  g: { label: 'Grams (g)', shortLabel: 'g', kind: 'mass', factor: 1, step: 50 },
  kg: { label: 'Kilograms (kg)', shortLabel: 'kg', kind: 'mass', factor: 1000, step: 0.5 },
  ml: { label: 'Millilitres (ml)', shortLabel: 'ml', kind: 'volume', factor: 1, step: 50 },
  litre: { label: 'Litres (L)', shortLabel: 'L', kind: 'volume', factor: 1000, step: 0.5 },
  tsp: { label: 'Teaspoon (5 ml)', shortLabel: 'tsp', kind: 'volume', factor: 5, step: 0.5 },
  tbsp: { label: 'Tablespoon (15 ml)', shortLabel: 'tbsp', kind: 'volume', factor: 15, step: 0.5 },
  cup: { label: 'Cup (250 ml)', shortLabel: 'cup', kind: 'volume', factor: 250, step: 0.5 },
  count: { label: 'Count', shortLabel: '', kind: 'count', factor: 1, step: 0.5 },
}

const SAVE_FEEDBACK_MS = 1800

function formatAmount(value: number): string {
  return String(Number(value.toFixed(2)))
}

export default function FoodLog() {
  const { token } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[]>([])
  const [status, setStatus] = useState<'idle' | 'searching' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [portions, setPortions] = useState<Portion[]>([])
  const [scannerMessage, setScannerMessage] = useState(false)
  const [saved, setSaved] = useState(false)
  const requestId = useRef(0)
  const saveTimeout = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(saveTimeout.current), [])

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const term = query.trim()
    const id = ++requestId.current
    if (!term) {
      setResults([])
      setStatus('error')
      setMessage('Enter a food name to search.')
      return
    }
    setStatus('searching')
    setResults([])
    try {
      const foods = await api<Food[]>(`/food/catalog?q=${encodeURIComponent(term)}`, token ?? '')
      if (id !== requestId.current) return
      setResults(foods)
      setStatus('done')
    } catch (error) {
      if (id !== requestId.current) return
      console.error('Unable to search the food catalogue', error)
      setMessage('Unable to search foods. Check your connection and try again.')
      setStatus('error')
    }
  }

  function updatePortion(id: string, update: (portion: Portion) => Portion) {
    setPortions((current) =>
      current.map((portion) => (portion.food.id === id ? update(portion) : portion)),
    )
  }

  function saveMeal() {
    window.clearTimeout(saveTimeout.current)
    setSaved(true)
    saveTimeout.current = window.setTimeout(() => setSaved(false), SAVE_FEEDBACK_MS)
  }

  const itemWord = portions.length === 1 ? 'item' : 'items'

  return (
    <div className="food-log space-y-6">
      <PageHeader title="Log Meal" subtitle="Search, scan, and build your meal" />

      <form onSubmit={search} className="surface flex items-center gap-2 rounded-[1.75rem] p-2">
        <input
          className="field h-12 min-w-0 flex-1 border-0"
          type="search"
          aria-label="Search foods"
          placeholder="Search for a food…"
          maxLength={100}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            requestId.current += 1
            setStatus('idle')
            setResults([])
          }}
        />
        <Button type="submit" className="size-12 shrink-0 rounded-2xl px-0" aria-label="Search">
          <Search size={19} />
        </Button>
        <ImageCapture
          title="Scan food"
          photoDescription="a food photo"
          onCapture={() => setScannerMessage(true)}
          trigger={(open) => (
            <Button
              type="button"
              variant="outline"
              className="size-12 shrink-0 rounded-2xl px-0"
              aria-label="Scan food"
              onClick={() => {
                setScannerMessage(false)
                open()
              }}
            >
              <ScanLine size={19} />
            </Button>
          )}
        />
      </form>

      {scannerMessage && (
        <div
          role="status"
          className="pop-in surface flex items-center gap-2.5 rounded-2xl px-4 py-3 text-sm text-muted-foreground"
        >
          <ScanLine size={16} className="shrink-0 text-primary" aria-hidden="true" />
          <span className="min-w-0 flex-1">Photo captured. Food analysis is not available yet; the photo was not saved.</span>
          <button
            type="button"
            aria-label="Dismiss photo notice"
            onClick={() => setScannerMessage(false)}
            className="tap-scale flex size-9 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-primary/10 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
          >
            <X size={17} aria-hidden="true" />
          </button>
        </div>
      )}

      {status !== 'idle' && (
        <section
          aria-labelledby="food-results-title"
          className="pop-in surface space-y-3 rounded-[1.75rem] p-4"
        >
          <h2 id="food-results-title" aria-live="polite" className="flex items-center gap-2 text-sm font-semibold text-foreground/90">
            {status === 'searching' ? (
              <>
                <Loader2 size={16} className="animate-spin text-primary" aria-hidden="true" />
                Searching foods…
              </>
            ) : status === 'done' ? 'Search results' : 'Search'}
          </h2>
          <div aria-live="polite">
            {status === 'searching' && (
              <div aria-hidden="true" className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Array.from({ length: 6 }).map((_, index) => (
                  <div key={index} className="well shimmer-pulse h-11 rounded-full" />
                ))}
              </div>
            )}
            {status === 'error' && (
              <p role="alert" className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {message}
              </p>
            )}
            {status === 'done' && results.length === 0 && (
              <p className="rounded-2xl bg-muted/50 px-4 py-3 text-sm text-muted-foreground">
                No foods found. Try another search.
              </p>
            )}
            {status === 'done' && results.length > 0 && (
              <div className="space-y-2">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {results.map((food) => {
                    const added = portions.some((portion) => portion.food.id === food.id)
                    return (
                      <button
                        key={food.id}
                        type="button"
                        aria-pressed={added}
                        title={food.name}
                        onClick={() => {
                          setPortions((current) =>
                            current.some((portion) => portion.food.id === food.id)
                              ? current.filter((portion) => portion.food.id !== food.id)
                              : [
                                  ...current,
                                  { food, amount: '100', unit: 'g', baseAmount: 100 },
                                ],
                          )
                        }}
                        className={`tap-scale flex h-11 items-center justify-center gap-1.5 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${
                          added
                            ? 'border-primary/60 bg-primary/15 text-primary'
                            : 'border-border/70 bg-transparent text-foreground/85 hover:border-primary/40 hover:text-primary'
                        }`}
                      >
                        <span className="truncate">{food.name}</span>
                        {added && <Check size={14} className="shrink-0" aria-hidden="true" />}
                      </button>
                    )
                  })}
                </div>
                {results.length === 50 && (
                  <p className="text-xs text-muted-foreground">
                    Showing up to 50 foods. Refine your search for more.
                  </p>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {portions.length > 0 && (
        <section
          aria-labelledby="meal-title"
          className="pop-in surface space-y-4 rounded-[1.75rem] p-4"
        >
          <div>
            <h2 id="meal-title" className="text-sm font-semibold text-foreground/90">
              Your meal
            </h2>
            <p className="text-xs text-muted-foreground">
              {portions.length} {itemWord} added to this meal
            </p>
          </div>
          <div className="space-y-3">
            {portions.map((portion) => {
              const info = units[portion.unit]
              const numericAmount = Number(portion.amount)
              const validAmount =
                portion.amount.trim() !== '' &&
                Number.isFinite(numericAmount) &&
                numericAmount > 0 &&
                portion.baseAmount !== null
              const decDisabled = !validAmount || numericAmount - info.step <= 0
              return (
                <div key={portion.food.id} className="food-item-card pop-in surface rounded-2xl p-3.5">
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary"
                    >
                      <Utensils size={19} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{portion.food.name}</p>
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
                      aria-label={`Remove ${portion.food.name}`}
                      onClick={() =>
                        setPortions((current) => current.filter((item) => item.food.id !== portion.food.id))
                      }
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
                        updatePortion(portion.food.id, (current) => {
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
                          updatePortion(portion.food.id, (current) => ({
                            ...current,
                            amount,
                            baseAmount:
                              amount.trim() && Number.isFinite(value) ? value * units[current.unit].factor : null,
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
                        updatePortion(portion.food.id, (current) => {
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
                      updatePortion(portion.food.id, (current) => {
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
            })}
          </div>

          <div>
            <Button
              type="button"
              className="w-full justify-center rounded-2xl"
              onClick={saveMeal}
              disabled={saved}
            >
              {saved ? (
                <span className="check-pop flex items-center gap-2">
                  <Check size={18} aria-hidden="true" /> Meal saved
                </span>
              ) : (
                `Save meal · ${portions.length} ${itemWord}`
              )}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">
              Saving will sync with your diary soon — for now this is just a preview.
            </p>
          </div>
        </section>
      )}
    </div>
  )
}
