import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Check, Loader2, ScanLine, Search, Sparkles, X } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import { api } from '@/auth/api'
import { Button, PageHeader } from '@/components/kit'
import { ImageCapture } from '@/components/kit/ImageCapture'
import FoodReviewScan, { type ScanItem } from '@/food/FoodReviewScan'
import { encodeImage } from '@/food/image'
import { MealPortionCard } from '@/food/MealPortionCard'
import type { Portion } from '@/food/portions'

interface Food {
  id: string
  name: string
}

const SAVE_FEEDBACK_MS = 1800

export default function FoodLog() {
  const { token } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<Food[]>([])
  const [status, setStatus] = useState<'idle' | 'searching' | 'done' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [portions, setPortions] = useState<Portion[]>([])
  const [scanItems, setScanItems] = useState<ScanItem[] | null>(null)
  const [scanUnavailable, setScanUnavailable] = useState(false)
  const [saved, setSaved] = useState(false)
  const requestId = useRef(0)
  const saveTimeout = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(saveTimeout.current), [])

  async function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const term = query.trim()
    const id = ++requestId.current
    setScanUnavailable(false)
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

  if (scanItems !== null) {
    return <FoodReviewScan initialItems={scanItems} onCancel={() => setScanItems(null)} />
  }

  return (
    <div className="food-log space-y-6">
      <PageHeader title="Log Meal" subtitle="Search, scan, and build your meal" />

      {scanUnavailable && (
        <div
          role="status"
          className="pop-in flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3"
        >
          <Sparkles size={18} className="mt-0.5 shrink-0 text-amber-500" aria-hidden="true" />
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-semibold text-foreground">Our AI magic is unavailable</p>
            <p className="text-xs text-muted-foreground">
              Sorry about that — search for your food instead and add it in a tap.
            </p>
          </div>
          <button
            type="button"
            aria-label="Dismiss AI scan notice"
            onClick={() => setScanUnavailable(false)}
            className="tap-scale -mr-1 flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/50 hover:text-foreground"
          >
            <X size={16} />
          </button>
        </div>
      )}

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
          maxImages={1}
          review={{
            dialogLabel: 'Review food photo',
            title: 'Preview the Photo',
            firstImageLabel: 'Captured food',
            imageLabel: (index) => `Food photo ${index}`,
            notice: 'This photo will be sent to AI for analysis.',
            progressLabel: 'Analysing your food',
            errorMessage: 'Unable to analyse the food.',
            actionLabel: 'Analyse with AI',
            onAnalyse: async (images, signal) => {
              const image = await encodeImage(images[0])
              signal.throwIfAborted()
              try {
                const result = await api<{ items: ScanItem[] }>(
                  '/food/ai/food-analyse',
                  token ?? '',
                  { method: 'POST', body: JSON.stringify({ images: [image] }), signal },
                )
                signal.throwIfAborted()
                if (result.items.length > 0) {
                  setScanUnavailable(false)
                  setScanItems(result.items)
                  return
                }
              } catch (error) {
                if (signal.aborted) return
                console.error('Unable to analyse the food photo', error)
              }
              setScanUnavailable(true)
            },
          }}
          trigger={(open) => (
            <Button
              type="button"
              variant="outline"
              className="size-12 shrink-0 rounded-2xl px-0"
              aria-label="Scan food"
              onClick={open}
            >
              <ScanLine size={19} />
            </Button>
          )}
        />
      </form>

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
            {portions.map((portion) => (
              <MealPortionCard
                key={portion.food.id}
                portion={portion}
                onChange={(update) => updatePortion(portion.food.id, update)}
                onRemove={() => setPortions((current) => current.filter((item) => item.food.id !== portion.food.id))}
              />
            ))}
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
