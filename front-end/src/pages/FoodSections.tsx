import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CalendarDays, ChevronLeft, ChevronRight, User } from 'lucide-react'
import {
  addDays,
  dateKey,
  display,
  localDate,
  meals,
  streaks,
  total,
  useFoodData,
  useToday,
} from '@/food/diary'
import { FoodDataState, FoodRefreshNotice, MealRows } from '@/food/FoodViews'

export function FoodDiary() {
  const [params] = useSearchParams()
  const today = useToday()
  const initial = params.get('date')
  const [selected, setSelected] = useState(
    initial && /^\d{4}-\d{2}-\d{2}$/.test(initial) && dateKey(localDate(initial)) === initial
      ? initial
      : dateKey(today),
  )
  const [month, setMonth] = useState(() => {
    const date = localDate(selected)
    return new Date(date.getFullYear(), date.getMonth(), 1)
  })
  const { data, error, retry } = useFoodData()
  if (!data) return <FoodDataState error={error} retry={retry} />
  const entries = data.entries.filter((entry) => entry.entry_date === selected)
  const logged = new Set(data.entries.map((entry) => entry.entry_date))
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()
  return (
    <div className="food-dashboard space-y-4">
      {error && <FoodRefreshNotice error={error} retry={retry} />}
      <header className="flex items-center justify-between">
        <h1 className="text-[26px] font-bold">Diary</h1>
        <button
          aria-label="Jump to today"
          className="food-icon"
          onClick={() => {
            setSelected(dateKey(today))
            setMonth(new Date(today.getFullYear(), today.getMonth(), 1))
          }}
        >
          <CalendarDays size={20} />
        </button>
      </header>
      <section className="food-panel space-y-3 p-4" aria-label="Calendar">
        <div className="flex items-center justify-between">
          <button
            className="food-icon"
            aria-label="Previous month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
          >
            <ChevronLeft size={20} />
          </button>
          <h2 className="font-semibold">
            {month.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </h2>
          <button
            className="food-icon"
            aria-label="Next month"
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
          >
            <ChevronRight size={20} />
          </button>
        </div>
        <div className="grid grid-cols-7 gap-y-2 text-center">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <span key={day} className="food-muted text-xs">
              {day}
            </span>
          ))}
          {Array.from({ length: month.getDay() }, (_, index) => (
            <span key={`empty-${index}`} />
          ))}
          {Array.from({ length: days }, (_, index) => {
            const date = new Date(month.getFullYear(), month.getMonth(), index + 1)
            const key = dateKey(date)
            return (
              <button
                key={key}
                aria-label={`${date.toLocaleDateString(undefined, { dateStyle: 'full' })}${logged.has(key) ? ', logged' : ''}`}
                aria-pressed={selected === key}
                onClick={() => setSelected(key)}
                className={`mx-auto flex size-9 items-center justify-center rounded-full text-sm ${selected === key ? 'bg-primary font-bold text-primary-foreground' : logged.has(key) ? 'bg-[#173a2a] font-semibold text-[#8de3b0]' : 'food-muted'}`}
              >
                {index + 1}
              </button>
            )
          })}
        </div>
      </section>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-semibold">
          {localDate(selected).toLocaleDateString(undefined, { dateStyle: 'medium' })}
        </h2>
        <p className="food-muted text-sm">
          {display(total(entries, 'calories'))} {data.goal ? `of ${display(data.goal)}` : ''} kcal
        </p>
      </div>
      <MealRows entries={entries} date={selected} />
      {meals.map((meal) => {
        const items = entries.filter((entry) => entry.meal === meal)
        return (
          items.length > 0 && (
            <section key={meal} className="food-panel p-4">
              <h3 className="font-semibold capitalize">{meal}</h3>
              {items.map((entry) => (
                <div
                  key={entry.id}
                  className="food-muted flex justify-between gap-3 border-t border-[#365a50] py-2 text-sm"
                >
                  <span>
                    {entry.food_name} · {display(entry.weight_g)} g
                  </span>
                  <span>{display(entry.calories)} kcal</span>
                </div>
              ))}
            </section>
          )
        )
      })}
      {entries.some((entry) => entry.calories === null) && (
        <p className="food-muted text-xs">Calories are unavailable for one or more foods.</p>
      )}
    </div>
  )
}

export function FoodInsights() {
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const { data, error, retry } = useFoodData()
  const today = useToday()
  if (!data) return <FoodDataState error={error} retry={retry} />
  const start =
    period === 'week'
      ? addDays(today, -today.getDay())
      : new Date(today.getFullYear(), today.getMonth(), 1)
  const end =
    period === 'week' ? addDays(start, 6) : new Date(today.getFullYear(), today.getMonth() + 1, 0)
  const days = Array.from(
    {
      length:
        Math.round(
          (Date.UTC(end.getFullYear(), end.getMonth(), end.getDate()) -
            Date.UTC(start.getFullYear(), start.getMonth(), start.getDate())) /
            86400000,
        ) + 1,
    },
    (_, index) => addDays(start, index),
  )
  const grouped = days.map((date) => {
    const entries = data.entries.filter((entry) => entry.entry_date === dateKey(date))
    return { date, entries, calories: total(entries, 'calories') }
  })
  const completed = grouped.filter(
    (day) => dateKey(day.date) < dateKey(today) && day.entries.length > 0 && day.calories !== null,
  )
  const average = completed.length
    ? completed.reduce((sum, day) => sum + day.calories!, 0) / completed.length
    : null
  const onGoal = data.goal ? completed.filter((day) => day.calories! <= data.goal!).length : null
  const monthStart = dateKey(new Date(today.getFullYear(), today.getMonth(), 1))
  const loggedMonth = new Set(
    data.entries
      .filter((entry) => entry.entry_date >= monthStart && entry.entry_date <= dateKey(today))
      .map((entry) => entry.entry_date),
  ).size
  const max = Math.max(data.goal ?? 0, ...grouped.map((day) => day.calories ?? 0), 1)
  return (
    <div className="food-dashboard space-y-4">
      {error && <FoodRefreshNotice error={error} retry={retry} />}
      <header>
        <h1 className="text-[26px] font-bold">Insights</h1>
        <p className="food-muted text-sm">
          {period === 'week' ? 'This week' : 'This month'} ·{' '}
          {start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} –{' '}
          {end.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
        </p>
      </header>
      <div className="flex gap-2">
        {(['week', 'month'] as const).map((value) => (
          <button
            key={value}
            aria-pressed={period === value}
            onClick={() => setPeriod(value)}
            className={`rounded-full border px-4 py-2 text-sm font-semibold ${period === value ? 'border-primary bg-primary text-primary-foreground' : 'border-[#4a7a69]'}`}
          >
            {value === 'week' ? 'Week' : 'Month'}
          </button>
        ))}
      </div>
      <section className="food-panel space-y-4 p-5">
        <div>
          <p className="food-label">Average per day</p>
          <p className="mt-1 text-[40px] leading-none font-bold">
            {display(average)} <span className="food-muted text-sm font-normal">kcal</span>
          </p>
          <p className="food-muted mt-2 text-xs">Completed logged days with known calories</p>
        </div>
        <div
          role="img"
          aria-label={`Calories by day, ${period}`}
          className="relative flex h-32 items-end gap-1"
        >
          {grouped.map((day) => (
            <div
              key={dateKey(day.date)}
              className="flex h-full min-w-0 flex-1 items-end"
              title={`${dateKey(day.date)}: ${day.entries.length ? `${display(day.calories)} kcal` : 'not logged'}`}
            >
              <span
                className={`w-full rounded-t ${day.calories !== null && data.goal && day.calories > data.goal ? 'bg-[#ffd479]' : dateKey(day.date) === dateKey(today) ? 'bg-[#6fcf97]' : 'bg-[#4f9e78]'}`}
                style={{
                  height:
                    day.entries.length && day.calories !== null
                      ? `${Math.max(3, (day.calories / max) * 100)}%`
                      : '3px',
                  opacity: day.entries.length ? 1 : 0.25,
                }}
              />
            </div>
          ))}
          {data.goal && (
            <span
              className="pointer-events-none absolute right-0 left-0 border-t border-dashed border-white"
              style={{ bottom: `${(data.goal / max) * 100}%` }}
            />
          )}
        </div>
        {period === 'week' && (
          <div className="flex gap-1">
            {grouped.map((day) => (
              <span key={dateKey(day.date)} className="food-muted flex-1 text-center text-xs">
                {day.date.toLocaleDateString(undefined, { weekday: 'narrow' })}
              </span>
            ))}
          </div>
        )}
        <p className="food-muted text-xs">
          {data.goal ? `Goal ${display(data.goal)} kcal · ` : 'Set a goal on Home · '}Today so far ·
          Yellow: over goal
        </p>
      </section>
      <div className="grid grid-cols-3 gap-2">
        <div className="food-panel p-3">
          <p className="food-label">On goal</p>
          <p className="mt-1 text-xl font-bold">
            {onGoal === null ? '—' : `${onGoal} / ${completed.length}`}
          </p>
          <p className="food-muted text-xs">completed days</p>
        </div>
        <div className="food-panel p-3">
          <p className="food-label">Logged</p>
          <p className="mt-1 text-xl font-bold">
            {loggedMonth} / {today.getDate()}
          </p>
          <p className="food-muted text-xs">days this month</p>
        </div>
        <div className="food-panel p-3">
          <p className="food-label">Best run</p>
          <p className="mt-1 text-xl font-bold">{streaks(data.entries, today).longest}</p>
          <p className="food-muted text-xs">day streak</p>
        </div>
      </div>
    </div>
  )
}

export function FoodProfile() {
  return (
    <section className="flex min-h-[55vh] flex-col items-center justify-center text-center">
      <User className="mb-5 text-primary" size={30} />
      <h1 className="text-2xl font-bold">Profile</h1>
      <p className="mt-2 text-sm font-medium text-primary">Coming Soon</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Your food preferences will be available here.
      </p>
    </section>
  )
}
