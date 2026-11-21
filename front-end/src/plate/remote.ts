/**
 * Direct calls to the MyPlate API (`back-end/app/routers_plate.py`). Screens don't call
 * these: they go through `api.ts`, which saves locally first. Only the actions that need
 * the server's answer (kitchens, invites, presence, recipe import) wait on these.
 */
import { api } from '@/auth/api'
import type {
  GroceryItem,
  Idea,
  Kitchen,
  KitchenInvite,
  KitchenType,
  Meal,
  MealSlot,
  PlateSettings,
  PlateUser,
  UserId,
} from './types'

const id = (value: string) => encodeURIComponent(value)

export function send<T>(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  return api<T>('/plate' + path, '', {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

// ─── Sync ────────────────────────────────────────────────────────────────────────────────

export interface PlatePull {
  server_time: string
  me: PlateUser
  people: PlateUser[]
  contact_ids: UserId[]
  kitchens: Kitchen[]
  invites: KitchenInvite[]
  settings: PlateSettings
  /** Kitchens sent whole (first pull, or joined since): replace their local rows. */
  full_kitchens: string[]
  meals_from: string
  meals: Meal[]
  grocery_items: GroceryItem[]
  ideas: Idea[]
  deleted: { meals: string[]; grocery_items: string[]; ideas: string[] }
}

export const pull = (since?: string) =>
  api<PlatePull>(`/sync/plate/pull${since ? `?since=${encodeURIComponent(since)}` : ''}`, '')

/** A past week that isn't kept on the phone. */
export const listMeals = (from: string, to: string) =>
  send<Meal[]>('GET', `/meals?from=${from}&to=${to}`)

// ─── Kitchens ────────────────────────────────────────────────────────────────────────────

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

export type KitchenPatch = Partial<Pick<Kitchen, 'name' | 'emoji' | 'meal_slots'>> & {
  group_type?: Exclude<KitchenType, 'personal'>
}

export const updateKitchen = (kitchenId: string, patch: KitchenPatch) =>
  send<Kitchen>('PATCH', `/kitchens/${id(kitchenId)}`, patch)

export const leaveKitchen = (kitchenId: string) =>
  send<void>('DELETE', `/kitchens/${id(kitchenId)}/members/me`)

export const deleteKitchen = (kitchenId: string) =>
  send<void>('DELETE', `/kitchens/${id(kitchenId)}`)

/** Live layer: go live as shopping (or stop). Kept apart from sync for a future plan tier. */
export const setShopping = (kitchenIds: string[], shopping: boolean) =>
  send<Kitchen[]>('PUT', '/live/presence', { kitchen_ids: kitchenIds, shopping })

// ─── Invites ─────────────────────────────────────────────────────────────────────────────

export const acceptInvite = (inviteId: string) =>
  send<Kitchen>('POST', `/invites/${id(inviteId)}/accept`)

export const declineInvite = (inviteId: string) =>
  send<void>('POST', `/invites/${id(inviteId)}/decline`)

export const joinWithCode = (code: string) =>
  send<Kitchen>('POST', '/invites/join', { code: code.trim() })

export const inviteUsers = (kitchenId: string, userIds: UserId[]) =>
  send<Kitchen>('POST', `/kitchens/${id(kitchenId)}/invites`, { user_ids: userIds })

export const getInviteCode = async (kitchenId: string) =>
  (await send<{ code: string }>('POST', `/kitchens/${id(kitchenId)}/invite-code`)).code

// ─── Recipe import ───────────────────────────────────────────────────────────────────────

export interface ImportedRecipe {
  title: string
  ingredients: string[]
}

export const importRecipe = (url: string) =>
  send<ImportedRecipe>('POST', '/recipes/import', { url })
