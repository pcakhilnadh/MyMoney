import { Link } from 'react-router-dom'
import { ChevronRight, Coffee, Moon, Plus, Sun, Sunrise } from 'lucide-react'
import { display, meals, total, type FoodEntry } from './diary'

const icons = { breakfast: Sunrise, lunch: Sun, snacks: Coffee, dinner: Moon }

export function FoodDataState({ error, retry }: { error: string; retry: () => void }) {
  return error ? (
    <div role="alert" className="food-panel space-y-3 p-4">
      <p>{error}</p>
      <button className="text-primary" onClick={retry}>
        Try again
      </button>
    </div>
  ) : (
    <p role="status" className="food-muted">
      Loading food diary…
    </p>
  )
}

export function FoodRefreshNotice({ error, retry }: { error: string; retry: () => void }) {
  return (
    <div role="status" className="food-panel flex items-center justify-between gap-3 p-3 text-sm">
      <p>{error} Showing the last available data.</p>
      <button className="shrink-0 font-semibold text-primary" onClick={retry}>Try again</button>
    </div>
  )
}

export function MealRows({
  entries,
  date,
  home = false,
}: {
  entries: FoodEntry[]
  date: string
  home?: boolean
}) {
  return (
    <div className="space-y-2">
      {meals.map((meal) => {
        const items = entries.filter((entry) => entry.meal === meal)
        const Icon = icons[meal]
        return (
          <Link
            key={meal}
            to={`/food/add?date=${date}&meal=${meal}`}
            className={`food-panel flex items-center gap-3 ${home ? 'px-3 py-[9px]' : 'p-3'} ${items.length ? '' : 'border-dashed'} ${home && !items.length ? '!border-[#4a7a69] !bg-transparent' : ''}`}
          >
            <span
              className={`flex size-10 shrink-0 items-center justify-center bg-[#1a2824] ${home ? `rounded-[14px] border border-[#365a50] ${meal === 'snacks' ? 'text-[#8de3b0]' : meal === 'dinner' ? 'text-[#c9d6ff]' : 'text-[#ffd479]'}` : 'rounded-xl text-[#ffd479]'}`}
            >
              <Icon size={home ? 18 : 19} />
            </span>
            <span className="flex-1">
              <span className={`${home ? 'text-[15px] leading-[18px]' : ''} block font-semibold capitalize`}>
                {meal}
              </span>
              <span className={`food-muted ${home ? 'block text-[13px] leading-4' : 'text-xs'}`}>
                {items.length
                  ? `${items.length} ${items.length === 1 ? 'item' : 'items'} · ${display(total(items, 'calories'))} kcal`
                  : 'No items yet'}
              </span>
            </span>
            {home ? (
              items.length ? (
                <ChevronRight className="shrink-0 text-[#a9bfb5]" size={18} aria-hidden="true" />
              ) : (
                <span className="flex min-h-9 items-center gap-1 rounded-full bg-[#6fcf97] px-3 text-[13px] font-bold text-[#0c2218]">
                  <Plus size={16} strokeWidth={2.5} /> Add
                </span>
              )
            ) : (
              <span className="text-sm font-semibold text-primary">
                {items.length ? 'Add more ›' : '+ Add'}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
