import { useRef, useState, type FormEvent } from 'react'
import { ChevronDown, Minus, Plus, ScanLine, Search, Trash2 } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { api } from '@/auth/api'
import { Button, PageHeader } from '@/components/kit'
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
  countName: string
  baseAmount: number | null
}

const units: Record<Unit, { label: string; kind: 'mass' | 'volume' | 'count'; factor: number }> = {
  g: { label: 'g', kind: 'mass', factor: 1 },
  kg: { label: 'kg', kind: 'mass', factor: 1000 },
  ml: { label: 'ml', kind: 'volume', factor: 1 },
  litre: { label: 'litre', kind: 'volume', factor: 1000 },
  tsp: { label: 'tsp (5 ml)', kind: 'volume', factor: 5 },
  tbsp: { label: 'tbsp (15 ml)', kind: 'volume', factor: 15 },
  cup: { label: 'cup (250 ml)', kind: 'volume', factor: 250 },
  count: { label: 'count', kind: 'count', factor: 1 },
}

function formatAmount(value: number): string {
  return String(Number(value.toFixed(6)))
}

export default function FoodLog() {
  const { token } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[]>([])
  const [status, setStatus] = useState<'idle' | 'searching' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [portions, setPortions] = useState<Portion[]>([])
  const [scannerMessage, setScannerMessage] = useState(false)
  const requestId = useRef(0)

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

  return (
    <div className="space-y-5">
      <PageHeader title="Log Meal" />
      <form onSubmit={search} className="flex items-center gap-2">
        <input
          className="field min-w-0 flex-1"
          type="search"
          aria-label="Search foods"
          placeholder="Search foods"
          maxLength={100}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            requestId.current += 1
            setStatus('idle')
            setResults([])
          }}
        />
        <Button type="submit" className="size-12 px-0" aria-label="Search">
          <Search size={20} />
        </Button>
        <ImageCapture
          title="Scan food"
          photoDescription="a food photo"
          onCapture={() => setScannerMessage(true)}
          trigger={(open) => (
            <Button
              type="button"
              variant="outline"
              className="size-12 px-0"
              aria-label="Scan food"
              onClick={() => {
                setScannerMessage(false)
                open()
              }}
            >
              <ScanLine size={20} />
            </Button>
          )}
        />
      </form>
      {scannerMessage && (
        <p role="status" className="text-sm text-muted-foreground">
          Photo captured. Food analysis is not available yet; the photo was not saved.
        </p>
      )}
      <section aria-labelledby="food-results-title" className="space-y-3">
        <h2 id="food-results-title" className="text-sm font-semibold">Search results</h2>
        <div aria-live="polite">
          {status === 'idle' && <p className="text-sm text-muted-foreground">Search for a food to get started.</p>}
          {status === 'searching' && (
            <p role="status" className="text-sm text-primary">Searching foods…</p>
          )}
          {status === 'error' && <p role="alert" className="text-sm text-destructive">{message}</p>}
          {status === 'done' && results.length === 0 && (
            <p className="text-sm text-muted-foreground">No foods found. Try another search.</p>
          )}
          {status === 'done' && results.length > 0 && (
            <div className="space-y-2">
              <div className="flex flex-wrap gap-2">
                {results.map((food) => {
                  const added = portions.some((portion) => portion.food.id === food.id)
                  return (
                    <button
                      key={food.id}
                      type="button"
                      aria-pressed={added}
                      onClick={() => {
                        setPortions((current) => current.some((portion) => portion.food.id === food.id)
                          ? current.filter((portion) => portion.food.id !== food.id)
                          : [...current, { food, amount: '100', unit: 'g', countName: '', baseAmount: 100 }])
                      }}
                      className="rounded-full border border-primary/30 bg-primary/10 px-3 py-2 text-sm font-medium text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary aria-pressed:bg-primary/20"
                    >
                      {food.name}{added && <span aria-hidden="true"> ✓</span>}
                    </button>
                  )
                })}
              </div>
              {results.length === 50 && (
                <p className="text-xs text-muted-foreground">Showing up to 50 foods. Refine your search for more.</p>
              )}
            </div>
          )}
        </div>
      </section>
      {portions.length > 0 && (
        <section aria-labelledby="selected-foods-title" className="space-y-3">
          <h2 id="selected-foods-title" className="text-sm font-semibold">Selected foods</h2>
          <p className="text-xs text-muted-foreground">
            These portions are a draft and are not saved.
          </p>
          {portions.map((portion) => {
            const info = units[portion.unit]
            const numericAmount = Number(portion.amount)
            const validAmount = portion.amount.trim() !== '' && Number.isFinite(numericAmount) && numericAmount > 0 && portion.baseAmount !== null
            return (
              <details key={portion.food.id} open className="surface rounded-2xl">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-4 font-semibold [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1">{portion.food.name}</span>
                  <ChevronDown size={18} aria-hidden="true" />
                </summary>
                <div className="space-y-4 border-t border-border px-4 py-4">
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1.5 text-sm">
                      <span className="label">Amount</span>
                      <input
                        className="field"
                        type="number"
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
                            baseAmount: amount.trim() && Number.isFinite(value) ? value * units[current.unit].factor : null,
                          }))
                        }}
                      />
                    </label>
                    <label className="space-y-1.5 text-sm">
                      <span className="label">Unit</span>
                      <select
                        className="field"
                        aria-label={`Unit for ${portion.food.name}`}
                        value={portion.unit}
                        onChange={(event) => {
                          const nextUnit = event.target.value as Unit
                          updatePortion(portion.food.id, (current) => {
                            const previous = units[current.unit]
                            const next = units[nextUnit]
                            const baseAmount = previous.kind === next.kind
                              ? current.baseAmount
                              : next.kind === 'mass' ? 100 : next.kind === 'volume' ? 250 : 1
                            const amount = baseAmount === null ? '' : formatAmount(baseAmount / next.factor)
                            return { ...current, unit: nextUnit, amount, baseAmount }
                          })
                        }}
                      >
                        {Object.entries(units).map(([value, unit]) => (
                          <option key={value} value={value}>{unit.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {!validAmount && <p className="text-sm text-destructive">Enter an amount greater than zero.</p>}
                  {info.kind === 'count' && (
                    <label className="block space-y-1.5 text-sm">
                      <span className="label">What are you counting?</span>
                      <input
                        className="field"
                        aria-label={`Count description for ${portion.food.name}`}
                        placeholder="e.g. eggs or glasses"
                        value={portion.countName}
                        onChange={(event) => updatePortion(portion.food.id, (current) => ({
                          ...current, countName: event.target.value,
                        }))}
                      />
                    </label>
                  )}
                  {validAmount && info.kind !== 'count' && (
                    <p className="text-xs text-muted-foreground">
                      {formatAmount(portion.baseAmount!)} {info.kind === 'mass' ? 'g' : 'ml'}
                      {info.kind === 'volume' ? ' (1 cup = 250 ml)' : ''}
                    </p>
                  )}
                  <div className="flex items-center gap-2">
                    <Button
                      type="button" variant="outline" size="sm"
                      aria-label={`Decrease ${portion.food.name}`}
                      disabled={!validAmount || portion.baseAmount! <= (info.kind === 'count' ? 1 : 50)}
                      onClick={() => updatePortion(portion.food.id, (current) => {
                        const baseAmount = current.baseAmount! - (info.kind === 'count' ? 1 : 50)
                        return { ...current, baseAmount, amount: formatAmount(baseAmount / info.factor) }
                      })}
                    ><Minus /> {info.kind === 'count' ? '1' : info.kind === 'mass' ? '50 g' : '50 ml'}</Button>
                    <Button
                      type="button" variant="outline" size="sm"
                      aria-label={`Increase ${portion.food.name}`}
                      disabled={!validAmount}
                      onClick={() => updatePortion(portion.food.id, (current) => {
                        const baseAmount = current.baseAmount! + (info.kind === 'count' ? 1 : 50)
                        return { ...current, baseAmount, amount: formatAmount(baseAmount / info.factor) }
                      })}
                    ><Plus /> {info.kind === 'count' ? '1' : info.kind === 'mass' ? '50 g' : '50 ml'}</Button>
                    <Button
                      type="button" variant="ghost" size="icon-lg"
                      aria-label={`Remove ${portion.food.name}`}
                      className="ml-auto"
                      onClick={() => setPortions((current) => current.filter((item) => item.food.id !== portion.food.id))}
                    ><Trash2 /></Button>
                  </div>
                </div>
              </details>
            )
          })}
        </section>
      )}
    </div>
  )
}
