import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArrowRight, Plus, Search } from 'lucide-react'
import { Card, Input, PageHeader, SegmentedControl } from '@/components/kit'
import {
  MEAL_META,
  MEAL_ORDER,
  addFoodEntries,
  getFoodLibrary,
  isoDate,
  type MealType,
} from '@/lib/food'

export default function FoodAdd() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [date, setDate] = useState(searchParams.get('date') ?? isoDate())
  const [meal, setMeal] = useState<MealType>((searchParams.get('meal') as MealType) ?? 'breakfast')
  const [query, setQuery] = useState('')
  const [selectedFood, setSelectedFood] = useState<string | null>(null)
  const [quantity, setQuantity] = useState(1)
  const [unit, setUnit] = useState('serving')
  const [draftItems, setDraftItems] = useState<Array<{ name: string; quantity: number; unit: string }>>([])

  const suggestions = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const items = getFoodLibrary()

    if (!needle) return items.slice(0, 8)
    return items.filter((item) => item.toLowerCase().includes(needle)).slice(0, 8)
  }, [query])

  const addDraftItem = () => {
    const name = (selectedFood ?? query.trim()) || 'Custom food'
    if (!name) return

    setDraftItems((current) => [
      ...current,
      {
        name,
        quantity: Number(quantity) || 1,
        unit: unit || 'serving',
      },
    ])

    setQuery('')
    setSelectedFood(null)
    setQuantity(1)
    setUnit('serving')
  }

  const saveDraft = () => {
    if (!draftItems.length) return

    addFoodEntries(
      draftItems.map((item) => ({
        date,
        meal,
        name: item.name,
        quantity: item.quantity,
        unit: item.unit,
      })),
    )

    navigate('/food')
  }

  return (
    <div className="space-y-5">
      <PageHeader title="Add food" subtitle="Log meals for your day" />

      <Card className="space-y-4">
        <label className="block space-y-1.5">
          <span className="label">Date</span>
          <input
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            className="field"
          />
        </label>

        <div className="space-y-1.5">
          <span className="label">Meal</span>
          <SegmentedControl
            options={MEAL_ORDER.map((entry) => MEAL_META[entry].label)}
            value={MEAL_META[meal].label}
            onChange={(nextLabel) => {
              const match = MEAL_ORDER.find((entry) => MEAL_META[entry].label === nextLabel)
              if (match) setMeal(match)
            }}
          />
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute left-3 top-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search food items"
            className="pl-9"
          />
        </div>

        <div className="grid grid-cols-2 gap-2">
          {suggestions.map((food) => (
            <button
              key={food}
              type="button"
              onClick={() => {
                setQuery(food)
                setSelectedFood(food)
              }}
              className={`rounded-xl border px-3 py-2 text-left text-sm transition-colors ${
                selectedFood === food
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border bg-card text-foreground'
              }`}
            >
              {food}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-[1fr_120px] gap-3">
          <label className="block space-y-1.5">
            <span className="label">Quantity</span>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={quantity}
              onChange={(event) => setQuantity(Number(event.target.value) || 1)}
              className="field"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="label">Unit</span>
            <select value={unit} onChange={(event) => setUnit(event.target.value)} className="field">
              <option value="serving">serving</option>
              <option value="plate">plate</option>
              <option value="cup">cup</option>
              <option value="g">g</option>
              <option value="ml">ml</option>
            </select>
          </label>
        </div>

        <button
          type="button"
          onClick={addDraftItem}
          className="gloss flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 font-semibold text-primary-foreground"
        >
          <Plus size={18} />
          Add to {MEAL_META[meal].label}
        </button>
      </Card>

      {draftItems.length > 0 && (
        <Card className="space-y-3">
          <div className="label">Selected food</div>
          {draftItems.map((item, index) => (
            <div
              key={`${item.name}-${index}`}
              className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2 text-sm"
            >
              <span className="font-medium">{item.name}</span>
              <span className="text-muted-foreground">
                {item.quantity} {item.unit}
              </span>
            </div>
          ))}

          <button
            type="button"
            onClick={saveDraft}
            className="gloss flex w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 font-semibold text-primary-foreground"
          >
            Save food entries
            <ArrowRight size={18} />
          </button>
        </Card>
      )}
    </div>
  )
}
