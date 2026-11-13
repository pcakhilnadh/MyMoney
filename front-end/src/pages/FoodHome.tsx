import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Pencil, Trophy } from 'lucide-react'
import { api } from '@/auth/api'
import { useAuth } from '@/auth/AuthContext'
import { addDays, dateKey, display, streaks, total, useFoodData, useToday } from '@/food/diary'
import { FoodDataState, FoodRefreshNotice, MealRows } from '@/food/FoodViews'

export default function FoodHome() {
  const { token } = useAuth()
  const { data, error, retry, recordGoal } = useFoodData()
  const [editing, setEditing] = useState(false)
  const [goal, setGoal] = useState('')
  const [saving, setSaving] = useState(false)
  const [goalError, setGoalError] = useState('')
  const today = useToday()
  const key = dateKey(today)
  if (!data) return <FoodDataState error={error} retry={retry} />
  const entries = data.entries.filter((entry) => entry.entry_date === key)
  const calories = total(entries, 'calories')
  const progress = calories !== null && data.goal ? Math.round((calories / data.goal) * 100) : null
  const streak = streaks(data.entries, today)
  const weekStart = addDays(today, -today.getDay())
  const logged = new Set(data.entries.map((entry) => entry.entry_date))
  const macros = [
    { name: 'carbs', value: total(entries, 'carbs'), color: '#6fcf97' },
    { name: 'protein', value: total(entries, 'protein'), color: '#ffd479' },
    { name: 'fat', value: total(entries, 'fat'), color: '#f2a07b' },
  ]
  const macroTotal = macros.every((item) => item.value !== null)
    ? macros.reduce((sum, item) => sum + (item.value ?? 0), 0)
    : 0

  async function saveGoal() {
    const value = Number(goal)
    if (!Number.isInteger(value) || value <= 0 || value > 100000) {
      setGoalError('Enter a whole number between 1 and 100,000.')
      return
    }
    setSaving(true)
    setGoalError('')
    try {
      const result = await api<{ calories: number }>('/food/goal', token ?? '', {
        method: 'PUT',
        body: JSON.stringify({ calories: value }),
      })
      await recordGoal(result.calories)
      setEditing(false)
    } catch (reason) {
      console.error('Unable to save calorie goal', reason)
      setGoalError('Unable to save your goal. Check your connection and try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="food-dashboard flex flex-col gap-[14px]">
      {error && <FoodRefreshNotice error={error} retry={retry} />}
      <header className="flex min-h-11 items-center">
        <div>
          <h1 className="text-[26px] leading-tight font-bold tracking-[-0.02em]">Today</h1>
          <p className="food-muted mt-0.5 text-[13px]">
            {today.toLocaleDateString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'short',
              year: 'numeric',
            })}
          </p>
        </div>
      </header>
      <section
        className="food-panel flex flex-col gap-[14px] !rounded-[24px] px-[18px] py-4"
        aria-label="Calories today"
      >
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="food-label">Calories today</p>
            <p className="mt-1.5 text-[44px] leading-none font-bold tracking-[-0.03em] tabular-nums">
              {display(calories)} <span className="food-muted text-[15px] font-normal">kcal</span>
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="food-muted text-[13px]">
                {data.goal ? `of ${display(data.goal)} kcal` : 'No daily goal set'}
              </span>
              {progress !== null && (
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${calories! <= data.goal! ? 'bg-[#173a2a] text-[#8de3b0]' : 'bg-[#4b3426] text-[#ffd479]'}`}
                >
                  {calories! <= data.goal!
                    ? `${display(data.goal! - calories!)} left`
                    : `${display(calories! - data.goal!)} over`}
                </span>
              )}
              <button
                type="button"
                aria-label={data.goal ? 'Edit daily goal' : 'Set daily goal'}
                title={data.goal ? 'Edit daily goal' : 'Set daily goal'}
                className="flex min-h-8 items-center gap-1 rounded-full text-xs font-semibold text-[#6fcf97]"
                onClick={() => {
                  setGoal(data.goal?.toString() ?? '')
                  setEditing(!editing)
                  setGoalError('')
                }}
              >
                <Pencil size={14} aria-hidden="true" />
                {!data.goal && 'Set goal'}
              </button>
            </div>
          </div>
          <svg
            role="img"
            aria-label={
              progress === null
                ? 'Daily calorie progress unavailable'
                : `${progress}% of daily calorie goal`
            }
            className="size-[88px] shrink-0"
            viewBox="0 0 88 88"
          >
            <circle cx="44" cy="44" r="36" fill="none" stroke="#1a2824" strokeWidth="9" />
            {progress !== null && (
              <circle
                cx="44"
                cy="44"
                r="36"
                fill="none"
                stroke="#6fcf97"
                strokeWidth="9"
                strokeLinecap="round"
                pathLength="100"
                strokeDasharray={`${Math.min(progress, 100)} 100`}
                transform="rotate(-90 44 44)"
              />
            )}
            <text x="44" y="50" textAnchor="middle" fill="white" fontSize="17" fontWeight="700">
              {progress === null ? '—' : `${progress}%`}
            </text>
          </svg>
        </div>
        {editing && (
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(event) => {
              event.preventDefault()
              void saveGoal()
            }}
          >
            <label className="sr-only" htmlFor="food-goal">
              Daily calorie goal
            </label>
            <input
              id="food-goal"
              type="number"
              min="1"
              max="100000"
              step="1"
              value={goal}
              onChange={(event) => setGoal(event.target.value)}
              className="field min-w-0 flex-1"
            />
            <button
              disabled={saving}
              className="rounded-xl bg-primary px-4 font-semibold text-primary-foreground"
            >
              {saving ? 'Saving…' : 'Save'}
            </button>
            {goalError && (
              <p role="alert" className="w-full text-sm text-destructive">
                {goalError}
              </p>
            )}
          </form>
        )}
        <div
          aria-hidden="true"
          className="flex h-2 gap-1 overflow-hidden rounded-full bg-[#1a2824]"
        >
          {macroTotal > 0 &&
            macros.map((item) => (
              <span
                key={item.name}
                className="rounded-full"
                style={{ width: `${(item.value! / macroTotal) * 100}%`, background: item.color }}
              />
            ))}
        </div>
        <div className="grid grid-cols-3 gap-3">
          {macros.map((nutrient) => (
            <div key={nutrient.name}>
              <p className="food-muted flex items-center gap-1.5 text-xs capitalize">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: nutrient.color }}
                />
                {nutrient.name}
              </p>
              <p className="mt-0.5 text-[17px] font-bold tabular-nums">
                {display(nutrient.value)} <span className="food-muted text-xs font-normal">g</span>
              </p>
            </div>
          ))}
        </div>
        {calories === null && (
          <p className="food-muted text-xs">Calories are unavailable for one or more foods.</p>
        )}
      </section>
      <Link to="/food/insights" className="food-panel flex items-center gap-2.5 py-2.5 pr-4 pl-2.5">
        <span className="flex size-[52px] shrink-0 items-center justify-center rounded-full bg-[radial-gradient(circle,rgba(255,138,61,0.38)_0%,rgba(255,138,61,0.12)_45%,transparent_72%)] max-[359px]:size-10">
          <svg
            aria-hidden="true"
            width="36"
            height="36"
            viewBox="0 0 24 24"
            className="drop-shadow-[0_0_8px_rgba(255,138,61,0.6)]"
          >
            <path
              fill="#ff7a2f"
              d="M12.6 1.5C13.2 5.2 18.5 7.6 18.5 13.8A6.5 6.5 0 0 1 5.5 13.8C5.5 11.2 6.6 9.2 8.2 7.6C8.4 9.4 9 10.6 10 11C10.2 7.6 10.6 4.4 12.6 1.5Z"
            />
            <path
              fill="#ffb23e"
              d="M12.4 9C13 11.2 16 12.6 16 15.8A4 4 0 0 1 8 15.8C8 14.2 8.7 13 9.7 12C9.9 13.1 10.3 13.8 11 14.1C11.1 12.2 11.4 10.5 12.4 9Z"
            />
            <path
              fill="#ffe9a6"
              d="M12.2 14.5C12.6 15.6 14 16.3 14 17.8A2 2 0 0 1 10 17.8C10 16.6 11.2 15.8 12.2 14.5Z"
            />
          </svg>
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-bold tracking-[-0.01em] max-[359px]:text-[15px]">{streak.current} day streak</p>
          <div className="food-muted mt-1.5 flex items-center gap-[5px] text-[11px] max-[359px]:gap-[3px]">
            <span className="mr-[3px]">This week</span>
            {Array.from({ length: 7 }, (_, index) => (
              <span
                key={index}
                aria-label={`${dateKey(addDays(weekStart, index))} ${logged.has(dateKey(addDays(weekStart, index))) ? 'logged' : 'not logged'}`}
                className={`size-[9px] rounded-full ${logged.has(dateKey(addDays(weekStart, index))) ? 'bg-[#6fcf97]' : 'border-[1.5px] border-[#4a7a69]'}`}
              />
            ))}
          </div>
        </div>
        <div className="border-l border-[#365a50] pl-3.5 text-right">
          <p className="food-label flex items-center justify-end gap-1 !text-[#ffd479]">
            <Trophy size={13} /> Longest
          </p>
          <p className="mt-1 text-[17px] font-bold tabular-nums">
            {streak.longest} <span className="food-muted text-xs font-medium">days</span>
          </p>
        </div>
      </Link>
      <div className="flex flex-col gap-2">
        <div className="flex min-h-7 items-center justify-between">
          <h2 className="food-label">Meals</h2>
          <Link
            to={`/food/diary?date=${key}`}
            className="flex items-center text-[13px] font-semibold text-[#6fcf97]"
          >
            Meal breakdown <ChevronRight size={16} aria-hidden="true" />
          </Link>
        </div>
        <MealRows entries={entries} date={key} home />
      </div>
    </div>
  )
}
