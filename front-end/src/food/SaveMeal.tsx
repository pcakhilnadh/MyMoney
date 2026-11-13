import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button } from '@/components/kit'
import { mealLogsRepo } from '@/db/repos'
import { dateKey, meals, type Meal } from './diary'
import { units, type Portion } from './portions'

function scaled(value: number | null | undefined, weight: number): number | null {
  return value == null ? null : Number(((value * weight) / 100).toFixed(3))
}

export function SaveMeal({ portions }: { portions: Portion[] }) {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const requestedMeal = params.get('meal')
  const [meal, setMeal] = useState<Meal>(
    meals.find((item) => item === requestedMeal) ?? 'breakfast',
  )
  const [date, setDate] = useState(() => params.get('date') || dateKey(new Date()))
  const [weightState, setWeightState] = useState<{
    signature: string
    values: Record<string, string>
  }>({ signature: '', values: {} })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const portionSignature = JSON.stringify(
    portions.map((portion) => [portion.food.id, portion.amount, portion.unit]),
  )
  const weights = weightState.signature === portionSignature ? weightState.values : {}

  async function save() {
    const items = portions.map((portion, index) => {
      const rawWeight =
        units[portion.unit].kind === 'mass'
          ? portion.baseAmount
          : Number(weights[`${index}:${portion.food.id}`])
      const weight = rawWeight === null ? null : Number(rawWeight.toFixed(3))
      const quantity = Number(portion.amount)
      return {
        food_id: portion.food.id,
        food_name: portion.food.name,
        weight_g: weight,
        calories: weight === null ? null : scaled(portion.food.calories_100g, weight),
        protein: weight === null ? null : scaled(portion.food.protein_100g, weight),
        carbs: weight === null ? null : scaled(portion.food.carbs_100g, weight),
        fat: weight === null ? null : scaled(portion.food.fat_100g, weight),
        calories_100g: portion.food.calories_100g ?? null,
        protein_100g: portion.food.protein_100g ?? null,
        carbs_100g: portion.food.carbs_100g ?? null,
        fat_100g: portion.food.fat_100g ?? null,
        validQuantity: portion.amount.trim() !== '' && Number.isFinite(quantity) && quantity > 0,
      }
    })
    if (
      !date ||
      items.some(
        (item) =>
          !item.food_id ||
          !item.validQuantity ||
          item.weight_g === null ||
          !Number.isFinite(item.weight_g) ||
          item.weight_g <= 0 ||
          item.weight_g > 1000000,
      )
    ) {
      setError('Enter a valid date, portion and weight in grams for every item.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await mealLogsRepo.createMany(
        items.map((item) => ({
          entry_date: date,
          meal,
          food_id: item.food_id,
          food_name: item.food_name,
          weight_g: item.weight_g as number,
          calories: item.calories,
          protein: item.protein,
          carbs: item.carbs,
          fat: item.fat,
          calories_100g: item.calories_100g,
          protein_100g: item.protein_100g,
          carbs_100g: item.carbs_100g,
          fat_100g: item.fat_100g,
          image: null,
        })),
      )
      navigate(`/food/diary?date=${encodeURIComponent(date)}`)
    } catch (reason) {
      console.error('Unable to save meal locally', reason)
      setError('Unable to save your meal on this device. Please try again.')
      setBusy(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-sm">
        Date
        <input
          aria-label="Meal date"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          className="field mt-1 w-full"
        />
      </label>
      <label className="block text-sm">
        Meal
        <select
          aria-label="Meal"
          value={meal}
          onChange={(event) => setMeal(event.target.value as Meal)}
          className="field mt-1 w-full"
        >
          {meals.map((item) => (
            <option key={item} value={item}>
              {item[0].toUpperCase() + item.slice(1)}
            </option>
          ))}
        </select>
      </label>
      {portions.map(
        (portion, index) =>
          units[portion.unit].kind !== 'mass' && (
            <label key={`${index}:${portion.food.id}`} className="block text-sm">
              Weight of {portion.food.name} in grams
              <input
                type="number"
                min="0.001"
                max="1000000"
                step="0.001"
                value={weights[`${index}:${portion.food.id}`] ?? ''}
                onChange={(event) =>
                  setWeightState({
                    signature: portionSignature,
                    values: { ...weights, [`${index}:${portion.food.id}`]: event.target.value },
                  })
                }
                className="field mt-1 w-full"
              />
            </label>
          ),
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button
        type="button"
        className="w-full justify-center rounded-2xl"
        disabled={busy || !portions.length}
        onClick={() => void save()}
      >
        {busy
          ? 'Saving…'
          : `Save meal · ${portions.length} ${portions.length === 1 ? 'item' : 'items'}`}
      </Button>
    </div>
  )
}
