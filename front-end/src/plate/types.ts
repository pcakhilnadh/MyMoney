/**
 * MyPlate domain types. They mirror the planned schema (see the MyPlate spec): the UI says
 * "kitchen", the schema keeps `groups`. Identity comes from the host app's user table.
 */

export type UserId = string

/** A host-app user as MyPlate sees them (name and avatar come from the host profile). */
export interface PlateUser {
  id: UserId
  /** First name only; full names are never shared with other members. */
  name: string
  avatar?: string | null
  /** Avatar fill when there's no picture. */
  color?: string
}

export type KitchenType = 'personal' | 'couple' | 'family' | 'flatmates' | 'friends'

/** B = breakfast, L = lunch, S = snacks, D = dinner. */
export type MealSlot = 'B' | 'L' | 'S' | 'D'

export interface KitchenMember {
  user_id: UserId
  role: 'owner' | 'member'
  /** The member's colour inside this kitchen (avatar ring, tick attribution). */
  color: string
}

/** `groups` row plus its members, as returned by GET /plate/kitchens. */
export interface Kitchen {
  id: string
  name: string
  emoji: string
  group_type: KitchenType
  /** My Kitchen: one per user, private, can't be left. */
  is_personal: boolean
  owner_id: UserId
  /** Colour dot used on the switcher, rail and All-view legend. */
  color: string
  meal_slots: MealSlot[]
  timezone: string
  members: KitchenMember[]
  /** Email addresses invited who haven't joined yet. */
  invited: string[]
  /** Members who went live as shopping (presence; shared kitchens only). */
  shopping_now: UserId[]
  /** When each shopper went live (ISO time), for "Live · 12 min". */
  shopping_since: Partial<Record<UserId, string>>
  /** Something changed since I last opened this kitchen. */
  has_new_activity: boolean
  /** Local only: keeps the server's order on the phone. */
  position?: number
}

export type ChefType = 'MEMBER' | 'TOGETHER' | 'TAKEOUT' | 'EATING_OUT'
export type Reaction = 'heart' | 'up'

export interface PrepTask {
  id: string
  meal_plan_id: string
  title: string
  sort_order: number
  done_by: UserId | null
  done_at: string | null
}

/** `meal_plans` row with its attendees, reactions and pre-prep tasks embedded. */
export interface Meal {
  id: string
  group_id: string
  /** Local `YYYY-MM-DD` in the kitchen's timezone. */
  meal_date: string
  meal_slot: MealSlot
  /** The main dish. */
  title: string
  sides: string[]
  /** Set when this meal is leftovers of an earlier one; no prep and no shopping. */
  leftover_of: string | null
  chef_type: ChefType
  chef_user_id: UserId | null
  /** `meal_attendees`; personal meals always hold exactly the owner. */
  attendees: UserId[]
  guest_count: number
  reactions: Record<UserId, Reaction>
  recipe_url: string | null
  prep_tasks: PrepTask[]
  created_at?: string
}

export type Aisle =
  | 'Fresh Produce'
  | 'Dairy & Eggs'
  | 'Grains & Pulses'
  | 'Spices & Masala'
  | 'Bakery'
  | 'Meat & Fish'
  | 'Frozen'
  | 'Snacks & Drinks'
  | 'Household'
  | 'Other'

export interface GroceryItem {
  id: string
  group_id: string
  name: string
  quantity: string
  aisle: Aisle
  /** The meal this was added for, shown as e.g. "Fri Dinner"; null for quick adds. */
  meal_plan_id: string | null
  added_by: UserId
  checked_by: UserId | null
  checked_at: string | null
  created_at?: string
}

/** `cravings`: a private wishlist in My Kitchen, a vote in shared kitchens. */
export interface Idea {
  id: string
  group_id: string
  title: string
  added_by: UserId
  votes: UserId[]
  recipe_url: string | null
  created_at: string
}

/** `user_myplate_settings`. `default_group_id = null` means "All kitchens". */
export interface PlateSettings {
  default_group_id: string | null
  reminder_enabled: boolean
  /** `HH:MM`, between 19:00 and 22:00. */
  reminder_time: string
}

/** A pending invite addressed to the current user. */
export interface KitchenInvite {
  id: string
  group_id: string
  kitchen_name: string
  kitchen_emoji: string
  invited_by: UserId
}

/** What the kitchen picker shows: one kitchen, or every kitchen merged. */
export type KitchenSelection = string | 'all'

export type MealDraft = Omit<Meal, 'id' | 'prep_tasks' | 'reactions' | 'created_at'> & {
  prep_tasks: { id?: string; title: string }[]
}
