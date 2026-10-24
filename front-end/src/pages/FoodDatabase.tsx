import { useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { ArrowLeft, Plus } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, Input } from '@/components/kit'
import { addFoodLibraryItem, DEFAULT_FOOD_LIBRARY, getFoodLibrary } from '@/lib/food'

export default function FoodDatabase() {
  const [query, setQuery] = useState('')
  const [customFood, setCustomFood] = useState('')
  const foods = useLiveQuery(() => getFoodLibrary(), []) ?? DEFAULT_FOOD_LIBRARY

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return foods
    return foods.filter((food) => food.toLowerCase().includes(needle))
  }, [foods, query])

  const handleAddFood = async () => {
    const clean = customFood.trim()
    if (!clean) return
    try {
      await addFoodLibraryItem(clean)
      setCustomFood('')
    } catch (error) {
      console.error('Unable to save custom food', error)
      window.alert('Unable to save the custom food. Please try again.')
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/food/settings" className="flex size-10 items-center justify-center rounded-full bg-secondary text-primary">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <p className="text-sm text-muted-foreground">Food database</p>
          <h1 className="text-[28px] leading-tight font-bold">Saved foods</h1>
        </div>
      </div>

      <Card className="space-y-4">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search saved foods"
        />

        <div className="flex gap-2">
          <Input
            value={customFood}
            onChange={(event) => setCustomFood(event.target.value)}
            placeholder="Add custom food"
            className="flex-1"
          />
          <button
            type="button"
            onClick={handleAddFood}
            className="gloss flex items-center justify-center rounded-2xl px-4 text-primary-foreground"
            aria-label="Add custom food"
          >
            <Plus size={18} />
          </button>
        </div>
      </Card>

      <div className="space-y-2">
        {items.map((food) => (
          <div key={food} className="surface flex items-center justify-between rounded-2xl px-4 py-3">
            <span className="font-medium">{food}</span>
            <span className="text-xs text-muted-foreground">Saved</span>
          </div>
        ))}

        {items.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No foods matched your search.
          </div>
        )}
      </div>
    </div>
  )
}
