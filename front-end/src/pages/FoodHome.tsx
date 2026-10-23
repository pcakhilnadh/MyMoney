import { Link, useNavigate } from 'react-router-dom'
import { CalendarDays, Plus, Sparkles } from 'lucide-react'
import { Card } from '@/components/kit'
import {
  MEAL_META,
  MEAL_ORDER,
  countForDate,
  currentStreak,
  entriesForMeal,
  isoDate,
} from '@/lib/food'

export default function FoodHome() {
  const navigate = useNavigate()
  const today = isoDate()

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">Today</p>
          <h1 className="text-[28px] leading-tight font-bold">
            {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
          </h1>
        </div>
        <button
          type="button"
          onClick={() => navigate('/food/diary')}
          className="surface flex size-10 items-center justify-center rounded-full"
          aria-label="Open diary"
        >
          <CalendarDays size={18} className="text-primary" />
        </button>
      </header>

      <Card hero className="p-5">
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="text-sm font-medium text-white/75">Current streak</div>
            <div className="money mt-1 text-[38px] leading-none font-extrabold text-white">
              {currentStreak()} days
            </div>
          </div>
          <div className="flex size-12 items-center justify-center rounded-2xl bg-white/10">
            <Sparkles size={22} className="text-white" />
          </div>
        </div>
      </Card>

      <div className="space-y-3">
        {MEAL_ORDER.map((meal) => {
          const items = entriesForMeal(today, meal)
          const preview = items.slice(0, 2).map((entry) => entry.name).join(', ')

          return (
            <div key={meal} className="surface rounded-2xl p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{MEAL_META[meal].icon}</span>
                  <span className="font-semibold">{MEAL_META[meal].label}</span>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/food/add?date=${today}&meal=${meal}`)}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2.5 py-1.5 text-xs font-semibold text-primary"
                >
                  <Plus size={14} />
                  Add
                </button>
              </div>

              {items.length > 0 ? (
                <div className="space-y-2">
                  {items.map((entry) => (
                    <div
                      key={entry.id}
                      className="flex items-center justify-between rounded-xl bg-secondary/60 px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{entry.name}</span>
                      <span className="text-muted-foreground">
                        {entry.quantity} {entry.unit}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => navigate(`/food/add?date=${today}&meal=${meal}`)}
                  className="flex w-full items-center justify-center rounded-xl border border-dashed border-primary/30 bg-primary/5 px-3 py-4 text-sm font-medium text-primary"
                >
                  Add food for {MEAL_META[meal].label}
                </button>
              )}

              {items.length > 0 && <div className="mt-3 text-xs text-muted-foreground">{preview}</div>}
            </div>
          )
        })}
      </div>

      <Link
        to="/food/diary"
        className="surface flex items-center justify-between rounded-2xl px-4 py-3.5 font-medium"
      >
        <span>{countForDate(today)} items tracked today</span>
        <span className="text-primary">View diary</span>
      </Link>
    </div>
  )
}
