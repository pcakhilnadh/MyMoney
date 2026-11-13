import { useEffect, useRef, useState, type FormEvent } from 'react'
import { X } from 'lucide-react'
import { api } from '@/auth/api'
import { Button } from '@/components/kit'
import { categories, type Category, type FoodType, type Match } from './catalog'
import { encodeImage } from './image'

const fieldClass = 'field w-full rounded-xl px-3 py-2'

const nutritionFields = [
  ['calories_100g', 'Calories'],
  ['protein_100g', 'Protein (g)'],
  ['carbs_100g', 'Carbs (g)'],
  ['fat_100g', 'Fat (g)'],
  ['fiber_100g', 'Fiber (g)'],
] as const

type NutritionKey = (typeof nutritionFields)[number][0]

export interface CreateFoodInitialValues {
  name?: string
  aliases?: string
  description?: string
  category?: Category
  foodType?: FoodType
  nutrition?: Partial<Record<NutritionKey, string>>
}

export function CreateFood({
  token,
  initialValues,
  onClose,
  onCreated,
}: {
  token: string
  initialValues?: CreateFoodInitialValues
  onClose: () => void
  onCreated: (food: Match) => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [name, setName] = useState(initialValues?.name ?? '')
  const [aliases, setAliases] = useState(initialValues?.aliases ?? '')
  const [description, setDescription] = useState(initialValues?.description ?? '')
  const [category, setCategory] = useState<Category>(initialValues?.category ?? 'base_food')
  const [foodType, setFoodType] = useState<FoodType>(initialValues?.foodType ?? 'raw')
  const [nutrition, setNutrition] = useState<Partial<Record<NutritionKey, string>>>(
    () => initialValues?.nutrition ?? {},
  )
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
      for (const [key] of nutritionFields) {
        body[key] = nutrition[key] ? Number(nutrition[key]) : null
      }
      if (image) body.image = await encodeImage(image)
      const created = await api<{
        id: string
        base_food_name: string
        aliases: string | null
        category: Category
        food_type: FoodType
        calories_100g: number | null
        protein_100g: number | null
        carbs_100g: number | null
        fat_100g: number | null
        fiber_100g: number | null
      }>('/food/catalog', token, {
        method: 'POST',
        body: JSON.stringify(body),
      })
      onCreated({
        id: created.id,
        name: created.base_food_name,
        score: 1,
        calories_100g: created.calories_100g,
        protein_100g: created.protein_100g,
        carbs_100g: created.carbs_100g,
        fat_100g: created.fat_100g,
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
          {nutritionFields.map(([key, label]) => (
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
