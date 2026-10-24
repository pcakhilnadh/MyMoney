import { DB_SUB, db } from '@/db/db'
import { foodEntriesRepo, foodLibraryRepo } from '@/db/repos'
import type { FoodEntry, FoodLibraryItem, MealType } from '@/db/types'

export type { FoodEntry, MealType }

export const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'snacks', 'dinner']

export const MEAL_META: Record<MealType, { label: string; icon: string }> = {
  breakfast: { label: 'Breakfast', icon: '☀️' },
  lunch: { label: 'Lunch', icon: '🌤️' },
  snacks: { label: 'Snacks', icon: '☕' },
  dinner: { label: 'Dinner', icon: '🌙' },
}

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

const LEGACY_ENTRY_KEY = 'myfood.entries.v1'
const LEGACY_LIBRARY_KEY = 'myfood.custom.v1'
const migrationKey = `myfood.local-migrated.v1.${DB_SUB ?? 'anon'}`
let migration: Promise<void> | null = null

type LegacyFoodEntry = {
  id: string
  date: string
  meal: MealType
  name: string
  quantity: number
  unit: string
  createdAt?: string
}

function safeParse(value: string | null, key: string): unknown {
  if (!value) return []
  try {
    return JSON.parse(value) as unknown
  } catch (error) {
    console.error(`Unable to migrate legacy Food data from ${key}`, error)
    throw error
  }
}

function isLegacyFoodEntry(value: unknown): value is LegacyFoodEntry {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    typeof entry.date === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(entry.date) &&
    typeof entry.meal === 'string' &&
    MEAL_ORDER.some((meal) => meal === entry.meal) &&
    typeof entry.name === 'string' &&
    typeof entry.quantity === 'number' &&
    Number.isFinite(entry.quantity) &&
    entry.quantity > 0 &&
    typeof entry.unit === 'string' &&
    (entry.createdAt === undefined || typeof entry.createdAt === 'string')
  )
}

export async function migrateLegacyFoodStorage(): Promise<void> {
  if (localStorage.getItem(migrationKey) === 'complete') return
  if (migration) return migration

  migration = (async () => {
    const parsedEntries = safeParse(localStorage.getItem(LEGACY_ENTRY_KEY), LEGACY_ENTRY_KEY)
    const parsedFoods = safeParse(localStorage.getItem(LEGACY_LIBRARY_KEY), LEGACY_LIBRARY_KEY)
    if (!Array.isArray(parsedEntries)) {
      throw new Error('Legacy Food diary must be an array; migration was not applied')
    }
    if (!Array.isArray(parsedFoods)) {
      throw new Error('Legacy Food library must be an array; migration was not applied')
    }
    const oldEntries = parsedEntries.filter(isLegacyFoodEntry)
    const oldFoods = parsedFoods.filter((food): food is string => typeof food === 'string')
    if (oldEntries.length !== parsedEntries.length) {
      throw new Error('Legacy Food diary contains invalid records; migration was not applied')
    }
    if (oldFoods.length !== parsedFoods.length) {
      throw new Error('Legacy Food library contains invalid records; migration was not applied')
    }
    const now = new Date().toISOString()

    await db.transaction('rw', db.food_entries, db.food_library, async () => {
      for (const entry of oldEntries) {
        if (await db.food_entries.get(entry.id)) continue
        const createdAt = entry.createdAt || now
        await db.food_entries.add({
          id: entry.id,
          entry_date: entry.date,
          meal: entry.meal,
          name: entry.name.trim(),
          quantity: entry.quantity,
          unit: entry.unit,
          version: 1,
          status: 'active',
          sync_state: 'pending',
          created_at: createdAt,
          updated_at: createdAt,
        })
      }
      for (const food of oldFoods) {
        const name = food.trim().replace(/\s+/g, ' ')
        const normalizedName = name.toLocaleLowerCase()
        if (!normalizedName) continue
        const existing = await db.food_library.where('normalized_name').equals(normalizedName).first()
        if (existing) continue
        await db.food_library.add({
          id: crypto.randomUUID(),
          name,
          normalized_name: normalizedName,
          version: 1,
          status: 'active',
          sync_state: 'pending',
          created_at: now,
          updated_at: now,
        })
      }
    })

    localStorage.removeItem(LEGACY_ENTRY_KEY)
    localStorage.removeItem(LEGACY_LIBRARY_KEY)
    localStorage.setItem(migrationKey, 'complete')
  })().finally(() => {
    migration = null
  })

  return migration
}

export function isoDate(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export async function getEntries(): Promise<FoodEntry[]> {
  await migrateLegacyFoodStorage()
  return foodEntriesRepo.list()
}

export function entriesForDay(date: string, entries: FoodEntry[]): FoodEntry[] {
  return entries
    .filter((entry) => entry.entry_date === date && entry.status === 'active')
    .sort((a, b) => a.created_at.localeCompare(b.created_at))
}

export function entriesForMeal(date: string, meal: MealType, entries: FoodEntry[]): FoodEntry[] {
  return entriesForDay(date, entries).filter((entry) => entry.meal === meal)
}

export function trackedDates(entries: FoodEntry[]): string[] {
  return [...new Set(entries.filter((entry) => entry.status === 'active').map((entry) => entry.entry_date))].sort()
}

export function trackedDateSet(entries: FoodEntry[]): Set<string> {
  return new Set(trackedDates(entries))
}

export function countForDate(date: string, entries: FoodEntry[]): number {
  return entriesForDay(date, entries).length
}

export async function addFoodEntries(
  entries: Omit<FoodEntry, keyof import('@/db/types').Syncable>[],
): Promise<FoodEntry[]> {
  const created: FoodEntry[] = []
  for (const entry of entries) created.push(await foodEntriesRepo.create(entry))
  return created
}

export function currentStreak(entries: FoodEntry[]): number {
  const dates = trackedDateSet(entries)
  const today = new Date()
  let streak = 0
  for (let offset = 0; offset < 365; offset += 1) {
    const candidate = new Date(today)
    candidate.setDate(today.getDate() - offset)
    const key = isoDate(candidate)
    if (dates.has(key)) streak += 1
    else if (offset > 0) break
  }
  return streak
}

export function longestStreak(entries: FoodEntry[]): number {
  const dates = trackedDates(entries)
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

export async function getFoodLibrary(): Promise<string[]> {
  await migrateLegacyFoodStorage()
  const customFoods = await foodLibraryRepo.list()
  return [
    ...new Set([
      ...DEFAULT_FOOD_LIBRARY,
      ...customFoods.filter((food) => food.status === 'active').map((food) => food.name),
    ]),
  ]
}

export async function addFoodLibraryItem(name: string): Promise<FoodLibraryItem | undefined> {
  const normalized = name.trim().replace(/\s+/g, ' ')
  if (!normalized) return undefined
  const normalizedName = normalized.toLocaleLowerCase()
  const existing = (await foodLibraryRepo.list()).find(
    (food) => food.normalized_name === normalizedName,
  )
  if (existing) return existing
  return foodLibraryRepo.create({ name: normalized, normalized_name: normalizedName })
}

export function recentTrend(entries: FoodEntry[]) {
  const today = new Date()
  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(today)
    date.setDate(today.getDate() - (6 - index))
    return {
      name: date.toLocaleDateString('en-US', { weekday: 'short' }),
      value: countForDate(isoDate(date), entries),
    }
  })
}
