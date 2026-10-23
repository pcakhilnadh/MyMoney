import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { Card, PageHeader } from '@/components/kit'
import {
  MEAL_META,
  MEAL_ORDER,
  entriesForDay,
  entriesForMeal,
  isoDate,
  trackedDateSet,
  type MealType,
} from '@/lib/food'

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function formatCalendarMonth(date: Date) {
  return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
}

export default function FoodDiary() {
  const navigate = useNavigate()
  const { date: routeDate, mealType } = useParams<{ date?: string; mealType?: string }>()
  const [selectedDate, setSelectedDate] = useState(routeDate ?? isoDate())
  const [monthCursor, setMonthCursor] = useState(() => new Date(`${selectedDate}T12:00:00`))

  useEffect(() => {
    if (routeDate) {
      setSelectedDate(routeDate)
      setMonthCursor(new Date(`${routeDate}T12:00:00`))
    }
  }, [routeDate])

  const monthStart = useMemo(
    () => new Date(monthCursor.getFullYear(), monthCursor.getMonth(), 1),
    [monthCursor],
  )
  const days = useMemo(() => {
    const start = new Date(monthStart)
    start.setDate(1 - ((start.getDay() + 6) % 7))

    const cells: Date[] = []
    for (let index = 0; index < 42; index += 1) {
      const cell = new Date(start)
      cell.setDate(start.getDate() + index)
      cells.push(cell)
    }
    return cells
  }, [monthStart])

  const trackedDates = useMemo(() => trackedDateSet(), [selectedDate])

  const focusMeal = mealType && MEAL_ORDER.includes(mealType as MealType) ? mealType : null
  const dayEntries = entriesForDay(selectedDate)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <PageHeader title="Food diary" subtitle="Track by day and meal" />
        <button
          type="button"
          onClick={() => navigate(`/food/add?date=${selectedDate}`)}
          className="gloss flex size-10 items-center justify-center rounded-full text-primary-foreground"
          aria-label="Add food"
        >
          <Plus size={18} />
        </button>
      </div>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() - 1, 1))}
            className="text-sm font-semibold text-primary"
          >
            Prev
          </button>
          <span className="text-sm font-medium text-muted-foreground">{formatCalendarMonth(monthCursor)}</span>
          <button
            type="button"
            onClick={() => setMonthCursor(new Date(monthCursor.getFullYear(), monthCursor.getMonth() + 1, 1))}
            className="text-sm font-semibold text-primary"
          >
            Next
          </button>
        </div>

        <div className="grid grid-cols-7 gap-2 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
          {DAY_LABELS.map((day) => (
            <div key={day} className="py-1">
              {day}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-2">
          {days.map((day) => {
            const key = isoDate(day)
            const isCurrent = key === selectedDate
            const isThisMonth = day.getMonth() === monthCursor.getMonth()
            const isTracked = trackedDates.has(key)

            return (
              <button
                key={key}
                type="button"
                onClick={() => setSelectedDate(key)}
                className={`flex aspect-square items-center justify-center rounded-xl text-sm transition-colors ${
                  isCurrent
                    ? 'bg-primary text-primary-foreground shadow-lg'
                    : isTracked
                      ? 'bg-primary/15 text-primary'
                      : isThisMonth
                        ? 'bg-secondary text-foreground'
                        : 'bg-card text-muted-foreground'
                }`}
              >
                {day.getDate()}
              </button>
            )
          })}
        </div>
      </Card>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Selected day</div>
            <div className="mt-1 text-xl font-semibold">
              {new Date(`${selectedDate}T12:00:00`).toLocaleDateString('en-IN', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })}
            </div>
          </div>
          <button
            type="button"
            onClick={() => navigate(`/food/add?date=${selectedDate}`)}
            className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary"
          >
            Add food
          </button>
        </div>

        <div className="space-y-3">
          {MEAL_ORDER.map((meal) => {
            const items = entriesForMeal(selectedDate, meal)
            const isFocused = focusMeal === meal

            return (
              <div
                key={meal}
                className={`rounded-2xl border p-3 ${isFocused ? 'border-primary/35 bg-primary/5' : 'border-border bg-card'}`}
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-medium">
                    <span>{MEAL_META[meal].icon}</span>
                    <span>{MEAL_META[meal].label}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/food/add?date=${selectedDate}&meal=${meal}`)}
                    className="text-xs font-semibold text-primary"
                  >
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
                  <div className="rounded-xl border border-dashed border-primary/20 bg-primary/5 px-3 py-3 text-sm text-muted-foreground">
                    No entries logged.
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {dayEntries.length === 0 && (
          <div className="rounded-2xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
            No food tracked for this date yet.
          </div>
        )}
      </Card>
    </div>
  )
}
