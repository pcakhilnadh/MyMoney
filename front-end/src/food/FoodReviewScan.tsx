import { useEffect, useRef, useState } from 'react'
import { ArrowLeft, Loader2, Sparkles, X } from 'lucide-react'
import { api } from '@/auth/api'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/kit'
import { CreateFood } from './CreateFood'
import type { Category, FoodType, Match } from './catalog'
import { MealPortionCard } from './MealPortionCard'
import { units, type Portion, type Unit } from './portions'

export interface ScanItem {
  name: string
  canonical_name: string
  qty: number
  unit: 'g' | 'kg' | 'ml' | 'L' | 'Nos'
  cal: number
  food_type: FoodType
  food_category: Category
}
interface ReviewItem {
  key: number
  scan: ScanItem
  matches: Match[]
  selected: Match | null
  portion: Portion
}
interface BatchResult {
  results: { query: string; matches: Match[] }[]
}

export default function FoodReviewScan({
  initialItems,
  onCancel,
}: {
  initialItems: ScanItem[]
  onCancel: () => void
}) {
  const { token } = useAuth()
  const [items, setItems] = useState<ReviewItem[]>(() =>
    initialItems.map((scan, key) => {
      const unit: Unit = scan.unit === 'L' ? 'litre' : scan.unit === 'Nos' ? 'count' : scan.unit
      return {
        key,
        scan,
        matches: [],
        selected: null,
        portion: {
          food: { id: '', name: scan.name },
          amount: String(scan.qty),
          unit,
          baseAmount: scan.qty * units[unit].factor,
        },
      }
    }),
  )
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [creating, setCreating] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [searchStarted, setSearchStarted] = useState(false)
  const [searchComplete, setSearchComplete] = useState(false)
  const [error, setError] = useState('')
  const active = useRef(true)
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
    }
  }, [])

  function remove(key: number) {
    setItems((current) => current.filter((item) => item.key !== key))
  }
  function select(key: number, match: Match) {
    setItems((current) =>
      current.map((item) =>
        item.key === key
          ? { ...item, selected: match, portion: { ...item.portion, food: match } }
          : item,
      ),
    )
  }
  async function search() {
    setSearchStarted(true)
    setBusy(true)
    setError('')
    try {
      const batches: BatchResult[] = []
      for (let index = 0; index < items.length; index += 10) {
        batches.push(
          await api<BatchResult>('/food/catalog/search-batch', token ?? '', {
            method: 'POST',
            body: JSON.stringify({
              queries: items.slice(index, index + 10).map((item) => item.scan.canonical_name),
            }),
          }),
        )
      }
      const results = batches.flatMap((batch) => batch.results)
      if (results.length !== items.length)
        throw new Error('The catalogue returned an incomplete search result.')
      if (!active.current) return
      setItems(
        items.map((item, index) => {
          const matches = [...results[index].matches].sort((a, b) => b.score - a.score).slice(0, 6)
          const selected = matches.length === 1 ? matches[0] : null
          return {
            ...item,
            matches,
            selected,
            portion: selected ? { ...item.portion, food: selected } : item.portion,
          }
        }),
      )
      setSearchComplete(true)
      setStep(1)
    } catch (reason) {
      console.error('Unable to search scan results', reason)
      if (active.current)
        setError(reason instanceof Error ? reason.message : 'Unable to search foods.')
    } finally {
      if (active.current) setBusy(false)
    }
  }
  const unresolved = items.filter((item) => !item.selected).length
  const creatingItem = items.find((item) => item.key === creating)

  return (
    <div className="food-log space-y-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Review scan</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} {items.length === 1 ? 'item' : 'items'} found on your photo.
          </p>
        </div>
        <button
          type="button"
          aria-label="Cancel scan"
          onClick={onCancel}
          disabled={busy}
          className="rounded-full border p-2"
        >
          <X size={18} />
        </button>
      </header>
      <ol
        aria-label="Scan progress"
        className="relative grid grid-cols-3 text-center text-xs before:absolute before:left-[16.666%] before:right-[16.666%] before:top-3.5 before:h-px before:bg-primary/40 before:content-['']"
      >
        {['Scan Result', 'Search Result', 'Confirmation'].map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? 'step' : undefined}
            className={step === index ? 'font-bold text-primary' : 'text-muted-foreground'}
          >
            <span className="relative mx-auto mb-1 flex size-7 items-center justify-center rounded-full border border-primary/40 bg-card">
              {index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
      {step === 0 && items.length > 0 && (
        <p className="pop-in flex items-center justify-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-4 py-3 text-center text-xs text-primary shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
          <Sparkles size={14} className="shrink-0" aria-hidden="true" />
          <span className="text-balance">
            <span className="font-semibold">Magic complete</span>
            <span className="text-primary/80"> · remove what you don&apos;t need</span>
          </span>
        </p>
      )}
      {step > 0 && (
        <button
          type="button"
          onClick={() => setStep(step === 2 ? 1 : 0)}
          className="flex items-center gap-1 text-sm text-primary"
        >
          <ArrowLeft size={16} /> Back
        </button>
      )}
      {items.length === 0 && (
        <p className="surface rounded-2xl p-4 text-sm text-muted-foreground">
          No items remain in this scan.
        </p>
      )}
      {step === 2 ? (
        <section
          aria-labelledby="scan-meal-title"
          className="pop-in surface space-y-4 rounded-[1.75rem] p-4"
        >
          <div>
            <h2 id="scan-meal-title" className="text-sm font-semibold text-foreground/90">
              Your meal
            </h2>
            <p className="text-xs text-muted-foreground">
              {items.length} {items.length === 1 ? 'item' : 'items'} added to this meal
            </p>
          </div>
          <div className="space-y-3">
            {items.map((item) => (
              <MealPortionCard
                key={item.key}
                portion={item.portion}
                estimatedCalories={item.scan.cal}
                removeLabel={`Remove ${item.scan.name}`}
                onRemove={() => remove(item.key)}
                onChange={(update) =>
                  setItems((current) =>
                    current.map((entry) =>
                      entry.key === item.key ? { ...entry, portion: update(entry.portion) } : entry,
                    ),
                  )
                }
              />
            ))}
          </div>
        </section>
      ) : (
        <div className="space-y-2">
          {items.map((item, index) => (
            <section key={item.key} className="surface rounded-none px-3 py-2">
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <h2 className="truncate text-sm font-semibold">
                    <span className="text-muted-foreground">{index + 1} ·</span> {item.scan.name}
                  </h2>
                  {step === 1 && (
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap ${
                        item.matches.length === 1
                          ? 'bg-primary/15 text-primary'
                          : 'bg-amber-500/20 text-amber-500'
                      }`}
                    >
                      {item.matches.length === 0
                        ? 'No match'
                        : item.matches.length === 1
                          ? 'Exact match'
                          : 'Choose One'}
                    </span>
                  )}
                </div>
                <p className="shrink-0 text-xs leading-tight text-muted-foreground tabular-nums whitespace-nowrap">
                  <span className="font-medium">
                    {item.scan.qty} {item.scan.unit}
                  </span>
                  <span aria-hidden="true" className="mx-1">
                    ·
                  </span>
                  <span className="font-medium">{item.scan.cal} cal</span>
                </p>
                <button
                  type="button"
                  aria-label={`Remove ${item.scan.name}`}
                  onClick={() => remove(item.key)}
                  disabled={busy || (step === 0 && searchStarted)}
                  className="tap-scale -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full bg-destructive/10 text-destructive/80 transition-colors duration-150 hover:bg-destructive/30 hover:text-destructive disabled:opacity-40"
                >
                  <X size={16} />
                </button>
              </div>
              {step === 1 && (
                <div className="mt-2 space-y-2 border-t border-border/60 pt-2">
                  {item.matches.length === 0 && (
                    <p className="text-xs text-muted-foreground">No match found in the catalog.</p>
                  )}
                  <div className="flex flex-wrap gap-1.5">
                    {item.matches.map((match) => (
                      <button
                        key={match.id}
                        type="button"
                        aria-pressed={item.selected?.id === match.id}
                        onClick={() => select(item.key, match)}
                        className={`rounded-full border px-2.5 py-1.5 text-xs ${item.selected?.id === match.id ? 'border-primary bg-primary text-primary-foreground' : 'border-primary/30 bg-background'}`}
                      >
                        {match.name}
                      </button>
                    ))}
                  </div>
                  {item.selected?.createdDetails && (
                    <p className="text-xs text-muted-foreground">
                      Created: {item.selected.createdDetails.food_type} ·{' '}
                      {item.selected.createdDetails.category.replace('_', ' ')}
                      {item.selected.createdDetails.aliases &&
                        ` · ${item.selected.createdDetails.aliases}`}
                    </p>
                  )}
                  {item.matches.length === 0 && (
                    <button
                      type="button"
                      onClick={() => setCreating(item.key)}
                      className="w-full rounded-full border border-dashed border-primary/50 px-3 py-1.5 text-xs font-semibold text-primary"
                    >
                      + Create “{item.scan.name}”
                    </button>
                  )}
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {step === 0 && (
        <Button
          className="w-full"
          disabled={!items.length || busy}
          onClick={() => (searchComplete ? setStep(1) : void search())}
        >
          {busy ? (
            <>
              <Loader2 className="animate-spin" /> Searching…
            </>
          ) : searchComplete ? (
            'Continue to search results'
          ) : (
            'Search catalog'
          )}
        </Button>
      )}
      {step === 1 && (
        <Button
          className="w-full"
          disabled={!items.length || unresolved > 0}
          onClick={() => setStep(2)}
        >
          {unresolved ? `Resolve ${unresolved} more` : 'Continue to confirmation'}
        </Button>
      )}
      {step === 2 && (
        <>
          <p className="text-sm text-muted-foreground">
            Saving meals is not available yet. Review your selections here.
          </p>
          <Button className="w-full" disabled={!items.length} onClick={() => {}}>
            Save as one meal
          </Button>
          <Button variant="outline" className="w-full" onClick={onCancel}>
            Cancel
          </Button>
        </>
      )}
      {creatingItem && (
        <CreateFood
          token={token ?? ''}
          initialValues={{
            name: creatingItem.scan.canonical_name,
            category: creatingItem.scan.food_category,
            foodType: creatingItem.scan.food_type,
          }}
          onClose={() => setCreating(null)}
          onCreated={(match) => {
            setItems((current) =>
              current.map((item) =>
                item.key === creatingItem.key
                  ? {
                      ...item,
                      matches: [match],
                      selected: match,
                      portion: { ...item.portion, food: match },
                    }
                  : item,
              ),
            )
            setCreating(null)
          }}
        />
      )}
    </div>
  )
}
