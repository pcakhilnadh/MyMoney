import { useEffect, useState } from 'react'
import type { Meal, MealLog } from '@/db/types'
export { useFoodData } from './FoodDataProvider'

export type { Meal } from '@/db/types'
export const meals: Meal[] = ['breakfast', 'lunch', 'snacks', 'dinner']
export type FoodEntry = MealLog

export function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function localDate(key: string): Date {
  const [year, month, day] = key.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function addDays(date: Date, count: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + count)
}

export function useToday(): Date {
  const [today, setToday] = useState(() => new Date())
  useEffect(() => {
    const now = new Date()
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const timer = window.setTimeout(() => setToday(new Date()), next.getTime() - now.getTime() + 50)
    return () => window.clearTimeout(timer)
  }, [today])
  return today
}

export function total(
  entries: FoodEntry[],
  nutrient: 'calories' | 'protein' | 'carbs' | 'fat',
): number | null {
  return entries.some((entry) => entry[nutrient] === null)
    ? null
    : entries.reduce((sum, entry) => sum + (entry[nutrient] ?? 0), 0)
}

export function display(value: number | null): string {
  return value === null ? '—' : Math.round(value).toLocaleString()
}

export function streaks(entries: FoodEntry[], today: Date): { current: number; longest: number } {
  const dates = [
    ...new Set(entries.map((entry) => entry.entry_date).filter((key) => key <= dateKey(today))),
  ].sort()
  let longest = 0
  let run = 0
  let previous = ''
  for (const key of dates) {
    run = previous && dateKey(addDays(localDate(previous), 1)) === key ? run + 1 : 1
    longest = Math.max(longest, run)
    previous = key
  }
  const current = previous === dateKey(today) || previous === dateKey(addDays(today, -1)) ? run : 0
  return { current, longest }
}
