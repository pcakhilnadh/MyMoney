import type {
  Aisle,
  GroceryItem,
  Idea,
  Kitchen,
  KitchenSelection,
  KitchenType,
  Meal,
  MealSlot,
  UserId,
} from './types'

export const SLOT_ORDER: MealSlot[] = ['B', 'L', 'S', 'D']

export const SLOT_LABEL: Record<MealSlot, string> = {
  B: 'Breakfast',
  L: 'Lunch',
  S: 'Snacks',
  D: 'Dinner',
}

export const AISLES: Aisle[] = [
  'Fresh Produce',
  'Dairy & Eggs',
  'Grains & Pulses',
  'Spices & Masala',
  'Bakery',
  'Meat & Fish',
  'Frozen',
  'Snacks & Drinks',
  'Household',
  'Other',
]

export const AISLE_ICON: Record<Aisle, string> = {
  'Fresh Produce': '🥬',
  'Dairy & Eggs': '🧀',
  'Grains & Pulses': '🌾',
  'Spices & Masala': '🌶️',
  Bakery: '🍞',
  'Meat & Fish': '🐟',
  Frozen: '❄️',
  'Snacks & Drinks': '🥤',
  Household: '🧽',
  Other: '🛒',
}

export const KITCHEN_TYPE_LABEL: Record<KitchenType, string> = {
  personal: 'Personal',
  couple: 'Couple',
  family: 'Family',
  flatmates: 'Flatmates',
  friends: 'Friends',
}

const slotRank = (slot: MealSlot) => SLOT_ORDER.indexOf(slot)

export const byDateThenSlot = (a: Meal, b: Meal) =>
  a.meal_date.localeCompare(b.meal_date) || slotRank(a.meal_slot) - slotRank(b.meal_slot)

/** Keeps the rows that belong to the selected kitchen; `all` keeps everything. */
export function inSelection<T extends { group_id: string }>(
  rows: readonly T[],
  selection: KitchenSelection,
): T[] {
  return selection === 'all' ? [...rows] : rows.filter((row) => row.group_id === selection)
}

/** Today: everything I'm eating on `date`, across every kitchen. */
export function mealsIAmEating(meals: readonly Meal[], date: string, me: UserId): Meal[] {
  return meals
    .filter((meal) => meal.meal_date === date && meal.attendees.includes(me))
    .sort(byDateThenSlot)
}

/**
 * Whose prep list a meal lands on: the cook's, or everyone eating when it's cooked together.
 * Takeout and eating out never have prep.
 */
export function isMyPrep(meal: Meal, me: UserId): boolean {
  if (meal.chef_type === 'MEMBER') return meal.chef_user_id === me
  if (meal.chef_type === 'TOGETHER') return meal.attendees.includes(me)
  return false
}

/** The pre-prep checklist for `date` (tomorrow), grouped by meal. */
export function prepChecklist(meals: readonly Meal[], date: string, me: UserId): Meal[] {
  return meals
    .filter((meal) => meal.meal_date === date && meal.prep_tasks.length > 0 && isMyPrep(meal, me))
    .sort(byDateThenSlot)
    .map((meal) => ({
      ...meal,
      prep_tasks: [...meal.prep_tasks].sort((a, b) => a.sort_order - b.sort_order),
    }))
}

export function prepProgress(meals: readonly Meal[]) {
  const tasks = meals.flatMap((meal) => meal.prep_tasks)
  const done = tasks.filter((task) => task.done_at).length
  return { done, total: tasks.length, open: tasks.length - done }
}

export const leftToBuy = (items: readonly GroceryItem[]) => items.filter((item) => !item.checked_at)

export function groupBy<T, K extends string>(
  rows: readonly T[],
  key: (row: T) => K,
  order: readonly K[],
): { key: K; rows: T[] }[] {
  const buckets = new Map<K, T[]>()
  for (const row of rows) {
    const k = key(row)
    buckets.set(k, [...(buckets.get(k) ?? []), row])
  }
  return order.filter((k) => buckets.has(k)).map((k) => ({ key: k, rows: buckets.get(k)! }))
}

/** My Kitchen is a private wishlist (newest first); shared kitchens rank by votes. */
export function sortIdeas(ideas: readonly Idea[], kitchens: readonly Kitchen[]): Idea[] {
  const personal = new Set(kitchens.filter((k) => k.is_personal).map((k) => k.id))
  return [...ideas].sort((a, b) => {
    const votes =
      personal.has(a.group_id) || personal.has(b.group_id) ? 0 : b.votes.length - a.votes.length
    return votes || b.created_at.localeCompare(a.created_at)
  })
}

/** My Kitchen first, then the default, then the rest by name. */
export function orderKitchens(kitchens: readonly Kitchen[], defaultId: string | null): Kitchen[] {
  return [...kitchens].sort(
    (a, b) =>
      Number(b.is_personal) - Number(a.is_personal) ||
      Number(b.id === defaultId) - Number(a.id === defaultId) ||
      a.name.localeCompare(b.name),
  )
}

/**
 * `/meals/copy-week`: which source meals to copy into the target kitchen. Only slots that are
 * empty in the target are filled; the originals stay where they are.
 */
export function mealsToCopy(source: readonly Meal[], target: readonly Meal[]): Meal[] {
  const taken = new Set(target.map((meal) => `${meal.meal_date}|${meal.meal_slot}`))
  return source.filter((meal) => {
    const slot = `${meal.meal_date}|${meal.meal_slot}`
    if (taken.has(slot)) return false
    taken.add(slot)
    return true
  })
}

export function reactionCounts(meal: Meal) {
  const values = Object.values(meal.reactions)
  return {
    heart: values.filter((value) => value === 'heart').length,
    up: values.filter((value) => value === 'up').length,
  }
}

/** Best-effort title from a recipe link, e.g. `/recipes/paneer-butter-masala` → "Paneer butter masala". */
export function titleFromRecipeUrl(url: string): string | null {
  try {
    const parsed = new URL(url)
    const slug = parsed.pathname.split('/').filter(Boolean).pop()
    if (!slug) return null
    const words = decodeURIComponent(slug)
      .replace(/\.[a-z]+$/i, '')
      .replace(/[-_]+/g, ' ')
      .replace(/\d+/g, '')
      .trim()
    return words ? words[0].toUpperCase() + words.slice(1).toLowerCase() : null
  } catch {
    return null
  }
}

export const KITCHEN_EMOJI = ['🏡', '🙋', '🏢', '⛰️', '👨‍👩‍👧', '💼', '🍳', '🪔']

// Checked in order, so the more specific aisles win ("frozen peas", "peanut butter").
const AISLE_WORDS: [Aisle, RegExp][] = [
  ['Frozen', /frozen|ice cream/i],
  ['Household', /soap|detergent|tissue|foil|cleaner|sponge|garbage bag/i],
  ['Snacks & Drinks', /peanut butter|chips|namkeen|juice|coffee|tea|soda|chocolate|biscuit/i],
  ['Bakery', /bread|pav|bun|naan|kulcha|cake/i],
  ['Meat & Fish', /chicken|mutton|fish|prawn|meat/i],
  [
    'Spices & Masala',
    /masala|jeera|cumin|turmeric|haldi|kasuri|pepper|salt|spice|hing|cardamom|clove|sauce/i,
  ],
  ['Dairy & Eggs', /milk|curd|dahi|paneer|cheese|butter|ghee|cream|yogurt|egg/i],
  [
    'Grains & Pulses',
    /rice|atta|flour|dal|rajma|chana|oats|chia|poha|rava|sooji|lentil|moong|urad|pasta|noodle/i,
  ],
  [
    'Fresh Produce',
    /onion|tomato|potato|spinach|palak|banana|apple|lemon|ginger|garlic|chilli|coriander|carrot|fruit|veg|mint|cucumber|peas/i,
  ],
]

/** Picks an aisle from the item name so most items need no extra tap. */
export function guessAisle(name: string): Aisle {
  return AISLE_WORDS.find(([, pattern]) => pattern.test(name))?.[0] ?? 'Other'
}

/** "Fri Dinner": how a meal is referred to from the cart and the leftovers picker. */
export function mealLabel(meal: Pick<Meal, 'meal_date' | 'meal_slot'>): string {
  const day = new Date(`${meal.meal_date}T12:00:00`).toLocaleDateString('en-IN', {
    weekday: 'short',
  })
  return `${day} ${SLOT_LABEL[meal.meal_slot]}`
}

/** The first slot from `from` onward that this kitchen hasn't planned yet. */
export function nextEmptySlot(
  meals: readonly Meal[],
  kitchen: Pick<Kitchen, 'id' | 'meal_slots'>,
  dates: readonly string[],
): { date: string; slot: MealSlot } | null {
  const taken = new Set(
    meals.filter((m) => m.group_id === kitchen.id).map((m) => `${m.meal_date}|${m.meal_slot}`),
  )
  const slots = SLOT_ORDER.filter((slot) => kitchen.meal_slots.includes(slot))
  for (const date of dates)
    for (const slot of slots) if (!taken.has(`${date}|${slot}`)) return { date, slot }
  return null
}

/** Meals from `from` to the end of the week that I'm eating. */
export function mealsLeftThisWeek(meals: readonly Meal[], from: string, to: string, me: UserId) {
  return meals.filter((m) => m.meal_date >= from && m.meal_date <= to && m.attendees.includes(me))
    .length
}

/** Who's cooking a meal, from my point of view. Takeout and eating out have no cook. */
export function cooksIt(meal: Meal, me: UserId): boolean {
  return (
    (meal.chef_type === 'MEMBER' && meal.chef_user_id === me) ||
    (meal.chef_type === 'TOGETHER' && meal.attendees.includes(me))
  )
}

/** "with Naan, Raita", or null when a meal has no sides. */
export const sidesText = (meal: Pick<Meal, 'sides'>) =>
  meal.sides.length > 0 ? `with ${meal.sides.join(', ')}` : null

/** "You're shopping" / "Maya is shopping now" for kitchen lists; null when nobody is. */
export function shoppingLine(
  kitchen: Kitchen,
  me: UserId,
  nameOf: (id: UserId) => string,
): string | null {
  if (kitchen.is_personal || kitchen.shopping_now.length === 0) return null
  if (kitchen.shopping_now.includes(me)) return "You're shopping"
  return `${nameOf(kitchen.shopping_now[0])} is shopping now`
}
