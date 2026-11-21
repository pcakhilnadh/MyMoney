import { createContext, useContext } from 'react'
import type { GroceryItem, Idea, KitchenSelection, Meal, MealSlot } from './types'

export type PlateTab = 'today' | 'plan' | 'cart' | 'kitchens'

/** Every bottom sheet MyPlate can open. The provider renders one at a time. */
export type PlateSheet =
  | { kind: 'create'; tab: PlateTab }
  | { kind: 'switcher'; mode: 'plan' | 'cart' }
  | {
      kind: 'meal'
      kitchenId?: string
      meal?: Meal
      date?: string
      slot?: MealSlot
      fromIdea?: Idea
    }
  | { kind: 'item'; kitchenId: string; item?: GroceryItem }
  | { kind: 'idea'; kitchenId: string }
  | { kind: 'import'; kitchenId: string }
  | { kind: 'invite'; kitchenId: string }
  | { kind: 'newKitchen' }
  | { kind: 'join' }

export interface PlateContextValue {
  /** The kitchen Plan and Cart show. Shared: switching on one tab switches the other. */
  selection: KitchenSelection
  select: (selection: KitchenSelection) => void
  /** The kitchen new things go into when nothing more specific applies. */
  personalId: string | undefined
  sheet: PlateSheet | null
  open: (sheet: PlateSheet) => void
  close: () => void
}

export const PlateContext = createContext<PlateContextValue | null>(null)

export function usePlate(): PlateContextValue {
  const value = useContext(PlateContext)
  if (!value) throw new Error('usePlate must be used inside <PlateProvider>')
  return value
}

export function tabFromPath(pathname: string): PlateTab {
  if (pathname.startsWith('/plate/plan') || pathname.startsWith('/plate/ideas')) return 'plan'
  if (pathname.startsWith('/plate/cart')) return 'cart'
  if (pathname.startsWith('/plate/kitchens')) return 'kitchens'
  return 'today'
}
