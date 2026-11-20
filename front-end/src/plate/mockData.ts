/**
 * Stand-in data for MyPlate until the backend exists. Only `api.ts` reads this file; swap the
 * functions there for real requests and this file can be deleted.
 *
 * Dates are generated relative to today so Today, tomorrow's prep list and the week view
 * always have something to show.
 */
import { addDays, parseDateKey, todayKey } from './dates'
import type {
  Aisle,
  ChefType,
  GroceryItem,
  Idea,
  Kitchen,
  KitchenInvite,
  Meal,
  MealSlot,
  PlateSettings,
  PlateUser,
  Reaction,
  UserId,
} from './types'

/** Stand-in for the host app's user id until the backend returns it. */
export const ME: UserId = 'me'

/** Kitchen dots: muted so they sit well on the dark surface. */
export const KITCHEN_COLORS = ['#f97316', '#4ade80', '#2dd4bf', '#a78bfa', '#facc15', '#60a5fa']

export const AVATAR_COLORS = ['#b4553d', '#4f9a6b', '#3a8f8a', '#9a6a3f', '#7d5aa8', '#b0577a']

export interface MockDb {
  users: PlateUser[]
  /** Every kitchen the mock knows about, including ones the user hasn't joined yet. */
  kitchens: Kitchen[]
  meals: Meal[]
  groceries: GroceryItem[]
  ideas: Idea[]
  settings: PlateSettings
  invites: KitchenInvite[]
  /** Open invite codes → kitchen id. */
  inviteCodes: Record<string, string>
}

const users: PlateUser[] = [
  { id: ME, name: 'You', color: AVATAR_COLORS[0] },
  { id: 'maya', name: 'Maya', color: AVATAR_COLORS[1] },
  { id: 'rohan', name: 'Rohan', color: AVATAR_COLORS[2] },
  { id: 'kabir', name: 'Kabir', color: AVATAR_COLORS[3] },
  { id: 'isha', name: 'Isha', color: AVATAR_COLORS[4] },
  { id: 'amma', name: 'Amma', color: AVATAR_COLORS[5] },
  { id: 'appa', name: 'Appa', color: AVATAR_COLORS[3] },
  { id: 'neha', name: 'Neha', color: AVATAR_COLORS[2] },
]

const colorOf = (id: UserId) => users.find((u) => u.id === id)?.color ?? AVATAR_COLORS[0]

function kitchen(
  partial: Pick<Kitchen, 'id' | 'name' | 'emoji' | 'group_type' | 'owner_id' | 'color'> &
    Partial<Kitchen> & { memberIds: UserId[] },
): Kitchen {
  const { memberIds, ...rest } = partial
  return {
    is_personal: false,
    meal_slots: ['B', 'L', 'D'],
    timezone: 'Asia/Kolkata',
    shopping_now: [],
    shopping_since: {},
    invited: [],
    has_new_activity: false,
    ...rest,
    members: memberIds.map((user_id) => ({
      user_id,
      role: user_id === partial.owner_id ? 'owner' : 'member',
      color: colorOf(user_id),
    })),
  }
}

export function createMockDb(today = todayKey()): MockDb {
  let seq = 0
  const id = (prefix: string) => `${prefix}-${++seq}`
  const at = (offset: number) => addDays(today, offset)
  const stamp = new Date().toISOString()
  // Days until the coming Sunday (0 when today is Sunday).
  const toSunday = (7 - parseDateKey(today).getDay()) % 7

  const kitchens: Kitchen[] = [
    kitchen({
      id: 'k-me',
      name: 'My Kitchen',
      emoji: '🙋',
      group_type: 'personal',
      is_personal: true,
      owner_id: ME,
      color: KITCHEN_COLORS[0],
      memberIds: [ME],
    }),
    kitchen({
      id: 'k-home',
      name: 'Home',
      emoji: '🏡',
      group_type: 'couple',
      owner_id: ME,
      color: KITCHEN_COLORS[1],
      memberIds: [ME, 'maya'],
      shopping_now: ['maya'],
      shopping_since: { maya: new Date(Date.now() - 6 * 60_000).toISOString() },
      has_new_activity: true,
    }),
    kitchen({
      id: 'k-flat',
      name: 'Flat 4B',
      emoji: '🏢',
      group_type: 'flatmates',
      owner_id: 'rohan',
      color: KITCHEN_COLORS[2],
      meal_slots: ['L', 'D'],
      memberIds: ['rohan', ME, 'kabir'],
      has_new_activity: true,
    }),
    kitchen({
      id: 'k-trek',
      name: 'Trek Crew',
      emoji: '⛰️',
      group_type: 'friends',
      owner_id: 'kabir',
      color: KITCHEN_COLORS[3],
      memberIds: ['kabir', ME, 'isha', 'rohan'],
      has_new_activity: true,
    }),
    kitchen({
      id: 'k-family',
      name: 'Sunday Family',
      emoji: '👨‍👩‍👧',
      group_type: 'family',
      owner_id: 'amma',
      color: KITCHEN_COLORS[4],
      meal_slots: ['L', 'D'],
      memberIds: ['amma', ME, 'appa', 'neha'],
    }),
    // Not joined yet: reachable through the open code.
    kitchen({
      id: 'k-office',
      name: 'Office Lunch',
      emoji: '💼',
      group_type: 'friends',
      owner_id: 'isha',
      color: KITCHEN_COLORS[5],
      meal_slots: ['L'],
      memberIds: ['isha', 'neha'],
    }),
  ]

  const meals: Meal[] = []
  function meal(
    group_id: string,
    offset: number,
    meal_slot: MealSlot,
    title: string,
    chef: { type: ChefType; user?: UserId },
    extra: {
      sides?: string[]
      attendees?: UserId[]
      guests?: number
      reactions?: Record<UserId, Reaction>
      prep?: (string | [string, UserId])[]
      leftoverOf?: string
      recipe?: string
    } = {},
  ): string {
    const mealId = id('meal')
    const members = kitchens.find((k) => k.id === group_id)!.members.map((m) => m.user_id)
    meals.push({
      id: mealId,
      group_id,
      meal_date: at(offset),
      meal_slot,
      title,
      sides: extra.sides ?? [],
      leftover_of: extra.leftoverOf ?? null,
      chef_type: chef.type,
      chef_user_id: chef.type === 'MEMBER' ? (chef.user ?? ME) : null,
      attendees: extra.attendees ?? members,
      guest_count: extra.guests ?? 0,
      reactions: extra.reactions ?? {},
      recipe_url: extra.recipe ?? null,
      prep_tasks: (extra.prep ?? []).map((task, index) => {
        const [taskTitle, doneBy] = Array.isArray(task) ? task : [task, null]
        return {
          id: id('prep'),
          meal_plan_id: mealId,
          title: taskTitle,
          sort_order: index,
          done_by: doneBy,
          done_at: doneBy ? stamp : null,
        }
      }),
    })
    return mealId
  }

  const me = { type: 'MEMBER' as const, user: ME }
  const together = { type: 'TOGETHER' as const }
  const takeout = { type: 'TAKEOUT' as const }
  const by = (user: UserId) => ({ type: 'MEMBER' as const, user })

  // My Kitchen: breakfasts and work lunches.
  meal('k-me', -2, 'B', 'Masala dosa', me, { sides: ['Chutney'] })
  meal('k-me', -1, 'B', 'Upma', me)
  meal('k-me', 0, 'B', 'Overnight oats', me, { sides: ['Banana'] })
  meal('k-me', 0, 'L', 'Paneer tikka wrap', me, { sides: ['Apple'] })
  meal('k-me', 1, 'B', 'Overnight oats', me, {
    sides: ['Banana'],
    prep: [['Soak oats + chia in 2 jars', ME], 'Slice bananas into a box'],
  })
  meal('k-me', 1, 'L', 'Curd rice', me, { sides: ['Pickle'] })
  meal('k-me', 2, 'B', 'Poha', me)
  meal('k-me', 3, 'B', 'Besan chilla', me, { sides: ['Mint chutney'] })
  meal('k-me', 4, 'L', 'Lunch at Truffles', { type: 'EATING_OUT' })

  // Home: dinners with Maya, and the odd leftovers lunch.
  meal('k-home', -2, 'D', 'Dal tadka', by('maya'), { sides: ['Jeera rice'] })
  const pbm = meal('k-home', -1, 'D', 'Paneer butter masala', together, {
    sides: ['Naan'],
    reactions: { maya: 'heart' },
  })
  meal('k-home', 0, 'L', 'Paneer butter masala (leftovers)', together, {
    sides: ['Naan'],
    attendees: ['maya'],
    leftoverOf: pbm,
    reactions: { [ME]: 'heart' },
  })
  meal('k-home', 0, 'D', 'Thai green curry', takeout)
  const rajma = meal('k-home', 1, 'D', 'Rajma chawal', me, {
    sides: ['Kachumber salad'],
    prep: ['Soak rajma overnight', 'Chop onions & tomatoes, keep in fridge'],
    reactions: { maya: 'up' },
  })
  meal('k-home', 2, 'D', 'Aloo gobi', by('maya'), { sides: ['Roti', 'Raita'] })
  meal('k-home', 3, 'D', 'Pasta night', me, { sides: ['Garlic bread'], guests: 2 })

  // Flat 4B: shared dinners. You cook tomorrow but eat at Home.
  meal('k-flat', -1, 'D', 'Maggi night', by('kabir'))
  const friedRice = meal('k-flat', 1, 'D', 'Egg fried rice', me, {
    attendees: ['rohan', 'kabir'],
    prep: [['Cook rice in the morning so it cools', 'rohan'], 'Cut veg for fried rice'],
  })
  meal('k-flat', 2, 'L', 'Chole kulche', by('rohan'))

  // Trek Crew and Sunday Family.
  meal('k-trek', 4, 'B', 'Trail sandwiches', by('isha'))
  meal('k-trek', 4, 'L', 'Thepla & pickle', me, { prep: ['Make thepla dough'] })
  meal('k-family', toSunday, 'L', 'Hyderabadi biryani', by('amma'), {
    sides: ['Mirchi ka salan'],
  })

  const item = (
    group_id: string,
    name: string,
    aisle: Aisle,
    added_by: UserId = ME,
    extra: { meal?: string; checkedBy?: UserId } = {},
  ): GroceryItem => ({
    id: id('item'),
    group_id,
    name,
    quantity: '',
    aisle,
    meal_plan_id: extra.meal ?? null,
    added_by,
    checked_by: extra.checkedBy ?? null,
    checked_at: extra.checkedBy ? stamp : null,
  })

  const groceries: GroceryItem[] = [
    item('k-home', 'Tomatoes (1 kg)', 'Fresh Produce', 'maya', { meal: rajma }),
    item('k-home', 'Coriander', 'Fresh Produce'),
    item('k-home', 'Fresh Paneer (400g)', 'Dairy & Eggs', 'maya', { meal: pbm }),
    item('k-home', 'Frozen peas', 'Frozen'),
    item('k-home', 'Rajma (500g)', 'Grains & Pulses', 'maya', { meal: rajma }),
    item('k-home', 'Naan (4)', 'Bakery', 'maya', { meal: pbm, checkedBy: 'maya' }),
    item('k-me', 'Rolled oats', 'Grains & Pulses'),
    item('k-me', 'Chia seeds', 'Grains & Pulses'),
    item('k-me', 'Bananas (6)', 'Fresh Produce'),
    item('k-me', 'Milk (1 L)', 'Dairy & Eggs'),
    item('k-flat', 'Eggs (12)', 'Dairy & Eggs', 'rohan', { meal: friedRice }),
    item('k-flat', 'Spring onions', 'Fresh Produce', ME, { meal: friedRice }),
    item('k-flat', 'Soy sauce', 'Spices & Masala', 'kabir'),
    item('k-trek', 'Bread loaf', 'Bakery', 'isha'),
    item('k-trek', 'Peanut butter', 'Snacks & Drinks', 'kabir'),
    item('k-family', 'Basmati rice (2 kg)', 'Grains & Pulses', 'amma'),
  ]

  const idea = (
    group_id: string,
    title: string,
    added_by: UserId,
    votes: UserId[] = [],
    recipe_url: string | null = null,
  ): Idea => ({ id: id('idea'), group_id, title, added_by, votes, recipe_url, created_at: stamp })

  const ideas: Idea[] = [
    idea('k-me', 'Shakshuka', ME),
    idea('k-me', 'Khao suey', ME, [], 'https://example.com/recipes/khao-suey'),
    idea('k-home', 'Malai kofta', 'maya', ['maya', ME]),
    idea('k-home', 'Homemade pasta', 'maya', ['maya']),
    idea('k-flat', 'Pav bhaji', 'kabir', ['kabir', 'rohan']),
    idea('k-trek', 'Campfire maggi', 'isha', ['isha']),
  ]

  return {
    users,
    kitchens,
    meals,
    groceries,
    ideas,
    settings: { default_group_id: 'k-home', reminder_enabled: true, reminder_time: '20:00' },
    invites: [],
    inviteCodes: { OFFICE24: 'k-office' },
  }
}
