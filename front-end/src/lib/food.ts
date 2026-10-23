export type MealType = 'breakfast' | 'lunch' | 'snacks' | 'dinner'

export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'snacks', 'dinner']

export const MEAL_META: Record<MealType, { label: string; icon: string }> = {
  breakfast: { label: 'Breakfast', icon: '☀️' },
  lunch: { label: 'Lunch', icon: '🌤️' },
  snacks: { label: 'Snacks', icon: '☕' },
  dinner: { label: 'Dinner', icon: '🌙' },
}

export type FoodEntry = {
  id: string
  date: string
  meal: MealType
  name: string
  quantity: number
  unit: string
  createdAt: string
}

const FOOD_STORAGE_KEY = 'myfood.entries.v1'
const CUSTOM_FOOD_STORAGE_KEY = 'myfood.custom.v1'

export const DEFAULT_FOOD_LIBRARY = [
  'Oatmeal',
  'Banana',
  'Greek Yogurt',
  'Eggs',
  'Rice Bowl',
  'Chicken Salad',
  'Paneer Wrap',
  'Fruit Smoothie',
  'Avocado Toast',
  'Salad',
  'Pasta',
  'Soup',
  'Trail Mix',
  'Brownie',
  'Curry',
  'Apple',
  'Protein Shake',
]

export function isoDate(date = new Date()) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function safeParse<T>(value: string | null, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function getEntries(): FoodEntry[] {
  if (typeof window === 'undefined') return []
  return safeParse<FoodEntry[]>(localStorage.getItem(FOOD_STORAGE_KEY), [])
}

export function saveEntries(entries: FoodEntry[]) {
  if (typeof window === 'undefined') return
  localStorage.setItem(FOOD_STORAGE_KEY, JSON.stringify(entries))
}

export function addFoodEntries(entries: Omit<FoodEntry, 'id' | 'createdAt'>[]) {
  const nextEntries: FoodEntry[] = entries.map((entry) => ({
    ...entry,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  }))
  const allEntries = [...getEntries(), ...nextEntries]
  saveEntries(allEntries)
  return allEntries
}

export function entriesForDay(date: string) {
  return getEntries()
    .filter((entry) => entry.date === date)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
}

export function entriesForMeal(date: string, meal: MealType) {
  return entriesForDay(date).filter((entry) => entry.meal === meal)
}

export function trackedDates() {
  return [...new Set(getEntries().map((entry) => entry.date))].sort()
}

export function trackedDateSet() {
  return new Set(trackedDates())
}

export function countForDate(date: string) {
  return entriesForDay(date).length
}

export function currentStreak() {
  const dates = new Set(trackedDates())
  const today = new Date()
  let streak = 0

  for (let offset = 0; offset < 365; offset += 1) {
    const candidate = new Date(today)
    candidate.setDate(today.getDate() - offset)
    const key = isoDate(candidate)
    if (dates.has(key)) {
      streak += 1
    } else if (offset > 0) {
      break
    }
  }

  return streak
}

export function longestStreak() {
  const dates = trackedDates()
  if (dates.length === 0) return 0

  let current = 1
  let longest = 1

  for (let index = 1; index < dates.length; index += 1) {
    const previous = new Date(`${dates[index - 1]}T12:00:00`)
    const currentDate = new Date(`${dates[index]}T12:00:00`)
    const delta = (currentDate.getTime() - previous.getTime()) / 86400000

    if (delta === 1) {
      current += 1
      longest = Math.max(longest, current)
    } else {
      current = 1
    }
  }

  return longest
}

export function getFoodLibrary() {
  if (typeof window === 'undefined') return DEFAULT_FOOD_LIBRARY

  const customFoods = safeParse<string[]>(localStorage.getItem(CUSTOM_FOOD_STORAGE_KEY), [])
  return [...new Set([...DEFAULT_FOOD_LIBRARY, ...customFoods])]
}

export function addFoodLibraryItem(name: string) {
  if (typeof window === 'undefined') return []
  const normalized = name.trim()
  if (!normalized) return getFoodLibrary()

  const customFoods = safeParse<string[]>(localStorage.getItem(CUSTOM_FOOD_STORAGE_KEY), [])
  const updated = [...new Set([...customFoods, normalized])]
  localStorage.setItem(CUSTOM_FOOD_STORAGE_KEY, JSON.stringify(updated))
  return getFoodLibrary()
}

export function recentTrend() {
  const today = new Date()
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (6 - index))
    return {
      name: date.toLocaleDateString('en-US', { weekday: 'short' }),
      value: countForDate(isoDate(date)),
    }
  })
}
