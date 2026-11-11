import { useEffect, useRef, useState, type FormEvent } from 'react'
import { ArrowLeft, Loader2, X } from 'lucide-react'
import { api } from '@/auth/api'
import { useAuth } from '@/auth/AuthContext'
import { Button } from '@/components/kit'
import { encodeImage } from './image'

const categories = [
  'base_food',
  'dairy',
  'egg',
  'fish',
  'fruit',
  'grain',
  'ingredient',
  'legume',
  'meat',
  'nut_seed',
  'seafood',
  'vegetable',
] as const
type Category = (typeof categories)[number]
type FoodType = 'raw' | 'processed'
export interface ScanItem {
  name: string
  canonical_name: string
  qty: number
  unit: 'g' | 'kg' | 'ml' | 'L' | 'Nos'
  kcal: number
  food_type: FoodType
  food_category: Category
}
interface Match {
  id: string
  name: string
  score: number
  createdDetails?: {
    aliases: string | null
    category: Category
    food_type: FoodType
  }
}
interface ReviewItem {
  key: number
  scan: ScanItem
  matches: Match[]
  selected: Match | null
}
interface BatchResult {
  results: { query: string; matches: Match[] }[]
}

const fieldClass = 'field w-full rounded-xl px-3 py-2'

function CreateFood({
  item,
  token,
  onClose,
  onCreated,
}: {
  item: ScanItem
  token: string
  onClose: () => void
  onCreated: (food: Match) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(item.canonical_name)
  const [aliases, setAliases] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState<Category>(item.food_category)
  const [foodType, setFoodType] = useState<FoodType>(item.food_type)
  const [nutrition, setNutrition] = useState<Record<string, string>>({})
  const [image, setImage] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    dialog.current?.showModal()
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()
    if (!name.trim()) {
      setError('Enter a food name.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const body: Record<string, unknown> = {
        base_food_name: name.trim(),
        aliases: aliases.trim() || null,
        description: description.trim() || null,
        category,
        food_type: foodType,
      }
      for (const key of ['calories_100g', 'protein_100g', 'carbs_100g', 'fat_100g', 'fiber_100g']) {
        body[key] = nutrition[key] ? Number(nutrition[key]) : null
      }
      if (image) body.image = await encodeImage(image)
      const created = await api<{
        id: string
        base_food_name: string
        aliases: string | null
        category: Category
        food_type: FoodType
      }>('/food/catalog', token, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      onCreated({
        id: created.id,
        name: created.base_food_name,
        score: 1,
        createdDetails: {
          aliases: created.aliases,
          category: created.category,
          food_type: created.food_type,
        },
      })
    } catch (reason) {
      console.error('Unable to create food', reason)
      setError(
        reason instanceof Error ? reason.message : 'Unable to create food. Please try again.',
      )
    } finally {
      setBusy(false)
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-label="Create food"
      onCancel={(event) => {
        event.preventDefault()
        if (!busy) onClose()
      }}
      className="m-auto max-h-[90dvh] w-[min(94vw,30rem)] overflow-y-auto rounded-3xl bg-card p-5 text-foreground backdrop:bg-black/75"
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold">Create food</h2>
          <button type="button" aria-label="Close create food" onClick={onClose} disabled={busy}>
            <X size={20} />
          </button>
        </div>
        <label className="block space-y-1 text-sm">
          Food name{' '}
          <input
            className={fieldClass}
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            required
          />
        </label>
        <label className="block space-y-1 text-sm">
          Regional names (comma-separated){' '}
          <input
            className={fieldClass}
            value={aliases}
            onChange={(e) => setAliases(e.target.value)}
            maxLength={1000}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Description{' '}
          <textarea
            className={fieldClass}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={2000}
          />
        </label>
        <label className="block space-y-1 text-sm">
          Category{' '}
          <select
            className={fieldClass}
            value={category}
            onChange={(e) => setCategory(e.target.value as Category)}
          >
            {categories.map((value) => (
              <option key={value} value={value}>
                {value.replace('_', ' ')}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          Food type{' '}
          <select
            className={fieldClass}
            value={foodType}
            onChange={(e) => setFoodType(e.target.value as FoodType)}
          >
            <option value="raw">Raw</option>
            <option value="processed">Processed</option>
          </select>
        </label>
        <div className="grid grid-cols-2 gap-3">
          {(
            [
              ['calories_100g', 'Calories'],
              ['protein_100g', 'Protein (g)'],
              ['carbs_100g', 'Carbs (g)'],
              ['fat_100g', 'Fat (g)'],
              ['fiber_100g', 'Fiber (g)'],
            ] as const
          ).map(([key, label]) => (
            <label key={key} className="block space-y-1 text-sm">
              {label} per 100 g{' '}
              <input
                className={fieldClass}
                type="number"
                min="0"
                step="any"
                value={nutrition[key] ?? ''}
                onChange={(e) => setNutrition({ ...nutrition, [key]: e.target.value })}
              />
            </label>
          ))}
        </div>
        <label className="block space-y-1 text-sm">
          Food image (optional){' '}
          <input
            className="block w-full text-sm"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setImage(e.target.files?.[0] ?? null)}
          />
        </label>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <Button type="submit" className="w-full" disabled={busy}>
          {busy ? 'Saving…' : 'Save food'}
        </Button>
      </form>
    </dialog>
  )
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
    initialItems.map((scan, key) => ({ key, scan, matches: [], selected: null })),
  )
  const [step, setStep] = useState<0 | 1 | 2>(0)
  const [creating, setCreating] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
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
      current.map((item) => (item.key === key ? { ...item, selected: match } : item)),
    )
  }
  async function search() {
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
          const matches = results[index].matches
          const exact = matches.find(
            (match) =>
              match.name.trim().toLocaleLowerCase() ===
              item.scan.canonical_name.trim().toLocaleLowerCase(),
          )
          return { ...item, matches, selected: exact ?? null }
        }),
      )
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
            {items.length} {items.length === 1 ? 'item' : 'items'} found on your plate
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
      <ol aria-label="Scan progress" className="grid grid-cols-3 gap-1 text-center text-xs">
        {['Scan Result', 'Search Result', 'Confirmation'].map((label, index) => (
          <li
            key={label}
            aria-current={step === index ? 'step' : undefined}
            className={step === index ? 'font-bold text-primary' : 'text-muted-foreground'}
          >
            <span className="mx-auto mb-1 flex size-7 items-center justify-center rounded-full border border-primary/40">
              {index + 1}
            </span>
            {label}
          </li>
        ))}
      </ol>
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
          {initialItems.length
            ? 'No items remain in this scan.'
            : 'No food was found in this photo. Try another photo.'}
        </p>
      )}
      <div className="space-y-3">
        {items.map((item, index) => (
          <section key={item.key} className="surface space-y-3 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">
                {index + 1} · {step === 2 ? item.selected?.name : item.scan.name}
              </h2>
              <button
                type="button"
                aria-label={`Remove ${item.scan.name}`}
                onClick={() => remove(item.key)}
                disabled={busy}
                className="rounded-full p-1 text-muted-foreground hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>
            {step !== 1 && (
              <p className="text-sm text-muted-foreground">
                {item.scan.qty} {item.scan.unit} · {item.scan.kcal} kcal (estimated)
              </p>
            )}
            {step === 1 && (
              <>
                <p className="text-xs text-muted-foreground">
                  {item.matches.length === 0
                    ? 'No match found in the catalog.'
                    : item.selected
                      ? 'Selected match'
                      : 'Choose a match'}
                </p>
                <div className="flex flex-wrap gap-2">
                  {item.matches.map((match) => (
                    <button
                      key={match.id}
                      type="button"
                      aria-pressed={item.selected?.id === match.id}
                      onClick={() => select(item.key, match)}
                      className={`rounded-full border px-3 py-2 text-sm ${item.selected?.id === match.id ? 'border-primary bg-primary text-primary-foreground' : 'border-primary/30 bg-background'}`}
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
                <button
                  type="button"
                  onClick={() => setCreating(item.key)}
                  className="w-full rounded-full border border-dashed border-primary/50 px-3 py-2 text-sm font-semibold text-primary"
                >
                  + Create “{item.scan.name}”
                </button>
              </>
            )}
          </section>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {step === 0 && (
        <Button className="w-full" disabled={!items.length || busy} onClick={() => void search()}>
          {busy ? (
            <>
              <Loader2 className="animate-spin" /> Searching…
            </>
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
          item={creatingItem.scan}
          token={token ?? ''}
          onClose={() => setCreating(null)}
          onCreated={(match) => {
            setItems((current) =>
              current.map((item) =>
                item.key === creatingItem.key
                  ? { ...item, matches: [match, ...item.matches], selected: match }
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
