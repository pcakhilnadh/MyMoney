/**
 * MyPlate API client: one function per backend route under /api/plate (see
 * `back-end/app/routers_plate.py`). Requests reuse the app's session; a 401 refreshes it.
 */
import { api } from '@/auth/api'
import type {
  Aisle,
  GroceryItem,
  Idea,
  Kitchen,
  KitchenInvite,
  KitchenType,
  Meal,
  MealDraft,
  MealSlot,
  PlateSettings,
  PlateUser,
  Reaction,
  UserId,
} from './types'

const BASE = '/plate'

function get<T>(path: string): Promise<T> {
  return api<T>(BASE + path, '')
}

function send<T>(method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', path: string, body?: unknown) {
  return api<T>(BASE + path, '', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const id = (value: string) => encodeURIComponent(value)

// ─── People ──────────────────────────────────────────────────────────────────────────────

/** Me, creating My Kitchen the first time MyPlate opens. */
export const getMe = () => get<PlateUser>('/me')

/** Everyone who shares a kitchen with me, my contacts, and whoever invited me. */
export const listPeople = () => get<PlateUser[]>('/people')

/** People I can invite without a link: I already share a kitchen or a money group with them. */
export const listContacts = () => get<PlateUser[]>('/contacts')

// ─── Kitchens ────────────────────────────────────────────────────────────────────────────

export const listKitchens = () => get<Kitchen[]>('/kitchens')

export interface KitchenInput {
  name: string
  emoji: string
  group_type: Exclude<KitchenType, 'personal'>
  meal_slots?: MealSlot[]
}

export const createKitchen = (input: KitchenInput) =>
  send<Kitchen>('POST', '/kitchens', {
    ...input,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  })

export const updateKitchen = (
  kitchenId: string,
  patch: Partial<Pick<Kitchen, 'name' | 'emoji' | 'meal_slots'>> & {
    group_type?: Exclude<KitchenType, 'personal'>
  },
) => send<Kitchen>('PATCH', `/kitchens/${id(kitchenId)}`, patch)

/** Clears the "new activity" marker. */
export const markKitchenSeen = (kitchenId: string) =>
  send<void>('POST', `/kitchens/${id(kitchenId)}/seen`)

/** My Kitchen can't be left. */
export const leaveKitchen = (kitchenId: string) =>
  send<void>('DELETE', `/kitchens/${id(kitchenId)}/members/me`)

/** Owner only. Removes its meals, cart and ideas too. */
export const deleteKitchen = (kitchenId: string) =>
  send<void>('DELETE', `/kitchens/${id(kitchenId)}`)

/** Go live as shopping (or stop) in each kitchen. Presence lapses after an hour. */
export const setShopping = (kitchenIds: string[], shopping: boolean) =>
  send<Kitchen[]>('PUT', '/presence', { kitchen_ids: kitchenIds, shopping })

// ─── Invites ─────────────────────────────────────────────────────────────────────────────

export const listInvites = () => get<KitchenInvite[]>('/invites')

export const acceptInvite = (inviteId: string) =>
  send<Kitchen>('POST', `/invites/${id(inviteId)}/accept`)

export const declineInvite = (inviteId: string) =>
  send<void>('POST', `/invites/${id(inviteId)}/decline`)

export const joinWithCode = (code: string) =>
  send<Kitchen>('POST', '/invites/join', { code: code.trim() })

export const inviteUsers = (kitchenId: string, userIds: UserId[]) =>
  send<Kitchen>('POST', `/kitchens/${id(kitchenId)}/invites`, { user_ids: userIds })

/** The kitchen's open code, created once. */
export const getInviteCode = async (kitchenId: string) =>
  (await send<{ code: string }>('POST', `/kitchens/${id(kitchenId)}/invite-code`)).code

// ─── Meals ───────────────────────────────────────────────────────────────────────────────

/** Meals in every kitchen I'm in (at most 62 days). The All view merges these. */
export const listMeals = (from: string, to: string) => get<Meal[]>(`/meals?from=${from}&to=${to}`)

/** Creates the meal, or updates it when `id` is set. */
export const saveMeal = ({ id: mealId, ...draft }: MealDraft & { id?: string }) =>
  mealId ? send<Meal>('PUT', `/meals/${id(mealId)}`, draft) : send<Meal>('POST', '/meals', draft)

export const deleteMeal = (mealId: string) => send<void>('DELETE', `/meals/${id(mealId)}`)

/** Plans the meal's leftovers in the next empty slot within three days. */
export const planLeftovers = (mealId: string) =>
  send<Meal>('POST', `/meals/${id(mealId)}/leftovers`)

export const setReaction = (mealId: string, reaction: Reaction | null) =>
  send<Meal>('PUT', `/meals/${id(mealId)}/reaction`, { reaction })

export const setPrepTaskDone = (taskId: string, done: boolean) =>
  send<Meal>('PATCH', `/prep-tasks/${id(taskId)}`, { done })

/**
 * Copies one week into the empty slots of another week or kitchen; originals stay put.
 * "Plan with someone" copies My Kitchen into a new kitchen; "Copy last week" copies a
 * kitchen's previous week into this one.
 */
export const copyWeek = (input: {
  from_group_id: string
  to_group_id: string
  from_week: string
  to_week: string
}) => send<{ copied: number }>('POST', '/meals/copy-week', input)

// ─── Cart ────────────────────────────────────────────────────────────────────────────────

export const listGroceries = () => get<GroceryItem[]>('/grocery-items')

export const addGrocery = (input: {
  group_id: string
  name: string
  quantity?: string
  /** Leave out to have the aisle picked from the name. */
  aisle?: Aisle
  meal_plan_id?: string | null
}) => send<GroceryItem>('POST', '/grocery-items', input)

export const setGroceryChecked = (itemId: string, checked: boolean) =>
  send<GroceryItem>('PATCH', `/grocery-items/${id(itemId)}`, { checked })

export const deleteGrocery = (itemId: string) =>
  send<void>('DELETE', `/grocery-items/${id(itemId)}`)

export const clearChecked = (kitchenIds: string[]) =>
  send<void>('POST', '/grocery-items/clear-checked', { group_ids: kitchenIds })

// ─── Recipe import ───────────────────────────────────────────────────────────────────────

export interface ImportedRecipe {
  title: string
  ingredients: string[]
}

/** The backend reads the page's recipe data; a page it can't read still gives a name. */
export const importRecipe = (url: string) =>
  send<ImportedRecipe>('POST', '/recipes/import', { url })

// ─── Ideas ───────────────────────────────────────────────────────────────────────────────

export const listIdeas = () => get<Idea[]>('/ideas')

export const saveIdea = (input: { group_id: string; title: string; recipe_url: string | null }) =>
  send<Idea>('POST', '/ideas', input)

export const setIdeaVote = (ideaId: string, voted: boolean) =>
  send<Idea>('PUT', `/ideas/${id(ideaId)}/vote`, { voted })

export const deleteIdea = (ideaId: string) => send<void>('DELETE', `/ideas/${id(ideaId)}`)

// ─── Settings ────────────────────────────────────────────────────────────────────────────

export const getSettings = () => get<PlateSettings>('/settings')

export const updateSettings = (patch: Partial<PlateSettings>) =>
  send<PlateSettings>('PATCH', '/settings', patch)
