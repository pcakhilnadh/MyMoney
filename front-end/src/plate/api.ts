/**
 * MyPlate data access. Every function here is shaped like the backend call it will become
 * (the planned route is in each doc comment) and currently resolves against an in-memory copy
 * of `mockData.ts`. To move to the real backend, replace each body with an `api()` request;
 * the hooks and screens don't need to change.
 *
 * Mock state lives only for the current page load. Reloading resets it.
 */
import { AVATAR_COLORS, KITCHEN_COLORS, ME, createMockDb, type MockDb } from './mockData'
import { guessAisle, mealsToCopy, SLOT_ORDER, titleFromRecipeUrl } from './logic'
import { addDays } from './dates'
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

export class PlateApiError extends Error {}

let store: MockDb | null = null
const db = () => (store ??= createMockDb())

/** Resets the mock (tests and "start over" flows). */
export async function resetMockDb(next?: MockDb) {
  store = next ?? null
}

let seq = 0
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++seq}`
const now = () => new Date().toISOString()

/** Responses are copies, like JSON off the wire, so callers can't mutate the store. */
async function respond<T>(value: T): Promise<T> {
  await Promise.resolve()
  return structuredClone(value)
}

const isMember = (kitchen: Kitchen, user: UserId = ME) =>
  kitchen.members.some((member) => member.user_id === user)

function myKitchenIds() {
  return new Set(
    db()
      .kitchens.filter((k) => isMember(k))
      .map((k) => k.id),
  )
}

function findKitchen(id: string): Kitchen {
  const kitchen = db().kitchens.find((k) => k.id === id && isMember(k))
  if (!kitchen) throw new PlateApiError('That kitchen is no longer available.')
  return kitchen
}

function findMeal(id: string): Meal {
  const meal = db().meals.find((m) => m.id === id && myKitchenIds().has(m.group_id))
  if (!meal) throw new PlateApiError('That meal was removed.')
  return meal
}

// ─── People ──────────────────────────────────────────────────────────────────────────────

/** GET /plate/people: everyone who shares a kitchen with me, plus my app contacts. */
export async function listPeople(): Promise<PlateUser[]> {
  return respond(db().users)
}

/** GET /plate/contacts: host-app users I can invite without a link. */
export async function listContacts(): Promise<PlateUser[]> {
  return respond(db().users.filter((user) => user.id !== ME))
}

// ─── Kitchens ────────────────────────────────────────────────────────────────────────────

/**
 * GET /plate/kitchens: kitchens I belong to. My Kitchen is created on first open (one per
 * user, enforced server-side by a partial unique index).
 */
export async function listKitchens(): Promise<Kitchen[]> {
  const state = db()
  if (!state.kitchens.some((k) => k.is_personal && k.owner_id === ME)) {
    state.kitchens.unshift({
      id: newId('k'),
      name: 'My Kitchen',
      emoji: '🙋',
      group_type: 'personal',
      is_personal: true,
      owner_id: ME,
      color: KITCHEN_COLORS[0],
      meal_slots: ['B', 'L', 'D'],
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      members: [{ user_id: ME, role: 'owner', color: AVATAR_COLORS[0] }],
      invited: [],
      shopping_now: [],
      shopping_since: {},
      has_new_activity: false,
    })
  }
  const mine = state.kitchens.filter((k) => isMember(k))
  mine.forEach(expireShopping)
  return respond(mine)
}

export interface KitchenInput {
  name: string
  emoji: string
  group_type: Exclude<KitchenType, 'personal'>
  meal_slots?: MealSlot[]
}

/** POST /plate/kitchens */
export async function createKitchen(input: KitchenInput): Promise<Kitchen> {
  const state = db()
  const used = new Set(state.kitchens.filter((k) => isMember(k)).map((k) => k.color))
  const kitchen: Kitchen = {
    id: newId('k'),
    name: input.name.trim(),
    emoji: input.emoji,
    group_type: input.group_type,
    is_personal: false,
    owner_id: ME,
    color: KITCHEN_COLORS.find((color) => !used.has(color)) ?? KITCHEN_COLORS[1],
    meal_slots: input.meal_slots ?? ['B', 'L', 'D'],
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    members: [{ user_id: ME, role: 'owner', color: AVATAR_COLORS[0] }],
    invited: [],
    shopping_now: [],
    shopping_since: {},
    has_new_activity: false,
  }
  state.kitchens.push(kitchen)
  return respond(kitchen)
}

/** PATCH /plate/kitchens/:id */
export async function updateKitchen(
  id: string,
  patch: Partial<Pick<Kitchen, 'name' | 'emoji' | 'group_type' | 'meal_slots' | 'color'>>,
): Promise<Kitchen> {
  const kitchen = findKitchen(id)
  if (kitchen.is_personal && patch.group_type && patch.group_type !== 'personal')
    throw new PlateApiError("My Kitchen can't change type.")
  Object.assign(kitchen, patch)
  return respond(kitchen)
}

/** Presence ends by itself after this long, so a forgotten "live" never lingers. */
export const SHOPPING_TTL_MS = 60 * 60_000

function expireShopping(kitchen: Kitchen) {
  const cutoff = Date.now() - SHOPPING_TTL_MS
  kitchen.shopping_now = kitchen.shopping_now.filter((user) => {
    const since = kitchen.shopping_since[user]
    const live = !since || Date.parse(since) > cutoff
    if (!live) delete kitchen.shopping_since[user]
    return live
  })
}

/**
 * PUT /plate/kitchens/:id/presence { shopping }: go live as shopping (or stop) in each kitchen.
 * Members see it on Cart and Kitchens; the backend broadcasts it on `group:{id}`.
 */
export async function setShopping(groupIds: string[], shopping: boolean): Promise<Kitchen[]> {
  const started = now()
  const changed = groupIds.map((id) => {
    const kitchen = findKitchen(id)
    if (kitchen.is_personal) throw new PlateApiError('There is nobody to tell in My Kitchen.')
    kitchen.shopping_now = kitchen.shopping_now.filter((user) => user !== ME)
    delete kitchen.shopping_since[ME]
    if (shopping) {
      kitchen.shopping_now.push(ME)
      kitchen.shopping_since[ME] = started
    }
    return kitchen
  })
  return respond(changed)
}

/** POST /plate/kitchens/:id/seen: clears the "new activity" marker. */
export async function markKitchenSeen(id: string): Promise<void> {
  findKitchen(id).has_new_activity = false
  return respond(undefined)
}

/** DELETE /plate/kitchens/:id/members/me. My Kitchen can't be left. */
export async function leaveKitchen(id: string): Promise<void> {
  const kitchen = findKitchen(id)
  if (kitchen.is_personal) throw new PlateApiError("My Kitchen can't be left.")
  kitchen.members = kitchen.members.filter((member) => member.user_id !== ME)
  if (kitchen.owner_id === ME && kitchen.members[0]) {
    kitchen.owner_id = kitchen.members[0].user_id
    kitchen.members[0].role = 'owner'
  }
  clearDefaultIf(id)
  return respond(undefined)
}

/** DELETE /plate/kitchens/:id (owner only). Removes its meals, cart and ideas too. */
export async function deleteKitchen(id: string): Promise<void> {
  const state = db()
  const kitchen = findKitchen(id)
  if (kitchen.is_personal) throw new PlateApiError("My Kitchen can't be deleted.")
  if (kitchen.owner_id !== ME) throw new PlateApiError('Only the owner can delete a kitchen.')
  state.kitchens = state.kitchens.filter((k) => k.id !== id)
  state.meals = state.meals.filter((m) => m.group_id !== id)
  state.groceries = state.groceries.filter((g) => g.group_id !== id)
  state.ideas = state.ideas.filter((i) => i.group_id !== id)
  clearDefaultIf(id)
  return respond(undefined)
}

function clearDefaultIf(id: string) {
  if (db().settings.default_group_id === id) db().settings.default_group_id = null
}

// ─── Invites ─────────────────────────────────────────────────────────────────────────────

/** GET /plate/invites: invites addressed to me. */
export async function listInvites(): Promise<KitchenInvite[]> {
  return respond(db().invites)
}

function join(kitchen: Kitchen) {
  if (!isMember(kitchen)) {
    kitchen.members.push({
      user_id: ME,
      role: 'member',
      color: AVATAR_COLORS[0],
    })
  }
  kitchen.invited = kitchen.invited.filter((user) => user !== ME)
}

/** POST /plate/invites/:id/accept */
export async function acceptInvite(inviteId: string): Promise<Kitchen> {
  const state = db()
  const invite = state.invites.find((i) => i.id === inviteId)
  const kitchen = invite && state.kitchens.find((k) => k.id === invite.group_id)
  if (!invite || !kitchen) throw new PlateApiError('This invite has expired.')
  join(kitchen)
  state.invites = state.invites.filter((i) => i.id !== inviteId)
  return respond(kitchen)
}

/** POST /plate/invites/:id/decline */
export async function declineInvite(inviteId: string): Promise<void> {
  db().invites = db().invites.filter((i) => i.id !== inviteId)
  return respond(undefined)
}

/** POST /plate/invites/join { code } */
export async function joinWithCode(code: string): Promise<Kitchen> {
  const state = db()
  const kitchenId = state.inviteCodes[code.trim().toUpperCase()]
  const kitchen = kitchenId && state.kitchens.find((k) => k.id === kitchenId)
  if (!kitchen)
    throw new PlateApiError("That code doesn't match a kitchen. Check it and try again.")
  join(kitchen)
  return respond(kitchen)
}

/** POST /plate/kitchens/:id/invites { user_ids }: invite host-app users in-app. */
export async function inviteUsers(kitchenId: string, userIds: UserId[]): Promise<Kitchen> {
  const kitchen = findKitchen(kitchenId)
  if (kitchen.is_personal) throw new PlateApiError('My Kitchen is private. Start a shared kitchen.')
  const fresh = userIds.filter(
    (user) => !isMember(kitchen, user) && !kitchen.invited.includes(user),
  )
  kitchen.invited.push(...fresh)
  return respond(kitchen)
}

/** POST /plate/kitchens/:id/invite-code: returns the kitchen's open code, creating one once. */
export async function getInviteCode(kitchenId: string): Promise<string> {
  const state = db()
  const kitchen = findKitchen(kitchenId)
  if (kitchen.is_personal) throw new PlateApiError('My Kitchen is private.')
  const existing = Object.entries(state.inviteCodes).find(([, id]) => id === kitchenId)?.[0]
  if (existing) return respond(existing)
  const letters = kitchen.name
    .replace(/[^a-z]/gi, '')
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, 'X')
  const code = `${letters}${Math.floor(10 + Math.random() * 90)}`
  state.inviteCodes[code] = kitchenId
  return respond(code)
}

// ─── Meals ───────────────────────────────────────────────────────────────────────────────

/** GET /plate/meals?from=&to=: meals in every kitchen I'm in. The All view merges these. */
export async function listMeals(from: string, to: string): Promise<Meal[]> {
  const mine = myKitchenIds()
  return respond(
    db().meals.filter((m) => mine.has(m.group_id) && m.meal_date >= from && m.meal_date <= to),
  )
}

/** POST /plate/kitchens/:id/meals, or PATCH /plate/meals/:id when `id` is set. */
export async function saveMeal(draft: MealDraft & { id?: string }): Promise<Meal> {
  const state = db()
  const kitchen = findKitchen(draft.group_id)
  const existing = draft.id ? findMeal(draft.id) : null
  const mealId = existing?.id ?? newId('meal')
  const members = new Set(kitchen.members.map((member) => member.user_id))
  const attendees = kitchen.is_personal ? [ME] : draft.attendees.filter((user) => members.has(user))
  const source = draft.leftover_of
    ? state.meals.find((m) => m.id === draft.leftover_of && m.group_id === kitchen.id)
    : null
  if (draft.leftover_of && !source) throw new PlateApiError('The original meal was removed.')
  if (attendees.length === 0 && draft.guest_count === 0)
    throw new PlateApiError('Pick at least one person who is eating.')

  const chefUser =
    draft.chef_type === 'MEMBER'
      ? kitchen.is_personal
        ? ME
        : members.has(draft.chef_user_id ?? '')
          ? draft.chef_user_id
          : ME
      : null
  const oldTasks = new Map(existing?.prep_tasks.map((task) => [task.id, task]))
  const meal: Meal = {
    id: mealId,
    group_id: kitchen.id,
    meal_date: draft.meal_date,
    meal_slot: draft.meal_slot,
    title: draft.title.trim(),
    sides: draft.sides.map((side) => side.trim()).filter(Boolean),
    leftover_of: source?.id ?? null,
    chef_type: draft.chef_type,
    chef_user_id: chefUser,
    attendees,
    guest_count: Math.max(0, Math.round(draft.guest_count)),
    reactions: existing?.reactions ?? {},
    recipe_url: draft.recipe_url?.trim() || null,
    // Leftovers, takeout and eating out have nothing to prep.
    prep_tasks:
      source || draft.chef_type === 'TAKEOUT' || draft.chef_type === 'EATING_OUT'
        ? []
        : draft.prep_tasks
            .filter((task) => task.title.trim())
            .map((task, index) => {
              const previous = task.id ? oldTasks.get(task.id) : undefined
              return {
                id: previous?.id ?? newId('prep'),
                meal_plan_id: mealId,
                title: task.title.trim(),
                sort_order: index,
                done_by: previous?.done_by ?? null,
                done_at: previous?.done_at ?? null,
              }
            }),
  }
  if (!meal.title) throw new PlateApiError('Give the meal a name.')
  state.meals = existing
    ? state.meals.map((m) => (m.id === mealId ? meal : m))
    : [...state.meals, meal]
  return respond(meal)
}

/**
 * POST /plate/meals/:id/leftovers: plans the meal's leftovers in the kitchen's next empty slot
 * after it, within three days. Leftovers need no prep and no shopping.
 */
export async function planLeftovers(mealId: string): Promise<Meal> {
  const state = db()
  const original = findMeal(mealId)
  const kitchen = findKitchen(original.group_id)
  const taken = new Set(
    state.meals
      .filter((m) => m.group_id === kitchen.id)
      .map((m) => `${m.meal_date}|${m.meal_slot}`),
  )
  const slots = SLOT_ORDER.filter((slot) => kitchen.meal_slots.includes(slot))
  const rank = SLOT_ORDER.indexOf(original.meal_slot)
  let next: { date: string; slot: MealSlot } | null = null
  for (const offset of [0, 1, 2, 3]) {
    const date = addDays(original.meal_date, offset)
    const slot = slots.find(
      (s) => (offset > 0 || SLOT_ORDER.indexOf(s) > rank) && !taken.has(`${date}|${s}`),
    )
    if (slot) {
      next = { date, slot }
      break
    }
  }
  if (!next) throw new PlateApiError('No free slot in the next three days for leftovers.')
  const meal: Meal = {
    ...structuredClone(original),
    id: newId('meal'),
    meal_date: next.date,
    meal_slot: next.slot,
    title: `${original.title.replace(/ [(]leftovers[)]$/, '')} (leftovers)`,
    leftover_of: original.id,
    reactions: {},
    prep_tasks: [],
  }
  state.meals.push(meal)
  return respond(meal)
}

/** DELETE /plate/meals/:id */
export async function deleteMeal(id: string): Promise<void> {
  findMeal(id)
  db().meals = db().meals.filter((m) => m.id !== id)
  return respond(undefined)
}

/** PUT /plate/meals/:id/reaction { reaction | null } */
export async function setReaction(mealId: string, reaction: Reaction | null): Promise<Meal> {
  const meal = findMeal(mealId)
  if (findKitchen(meal.group_id).is_personal)
    throw new PlateApiError('Reactions are for shared kitchens.')
  if (reaction) meal.reactions[ME] = reaction
  else delete meal.reactions[ME]
  return respond(meal)
}

/** PATCH /plate/prep-tasks/:id { done } */
export async function setPrepTaskDone(taskId: string, done: boolean): Promise<Meal> {
  const meal = db().meals.find((m) => m.prep_tasks.some((task) => task.id === taskId))
  if (!meal || !myKitchenIds().has(meal.group_id)) throw new PlateApiError('That task was removed.')
  const task = meal.prep_tasks.find((t) => t.id === taskId)!
  task.done_by = done ? ME : null
  task.done_at = done ? now() : null
  return respond(meal)
}

/**
 * POST /plate/meals/copy-week { from_group_id, to_group_id, from_week, to_week }: copies one
 * week's meals into the empty slots of another week or kitchen. The originals stay put.
 * "Plan with someone" copies My Kitchen into a new kitchen; "Copy last week" copies a
 * kitchen's previous week into this one.
 */
export async function copyWeek(input: {
  from_group_id: string
  to_group_id: string
  from_week: string
  to_week: string
}): Promise<{ copied: number }> {
  const state = db()
  const target = findKitchen(input.to_group_id)
  findKitchen(input.from_group_id)
  const shift = Math.round(
    (Date.parse(`${input.to_week}T12:00:00`) - Date.parse(`${input.from_week}T12:00:00`)) /
      86_400_000,
  )
  const inWeek = (start: string) => (m: Meal) =>
    m.meal_date >= start && m.meal_date <= addDays(start, 6)
  const source = state.meals
    .filter((m) => m.group_id === input.from_group_id && inWeek(input.from_week)(m))
    // Leftovers point at a meal that isn't being copied.
    .filter((m) => !m.leftover_of)
    .map((m) => ({ ...m, meal_date: addDays(m.meal_date, shift) }))
  const existing = state.meals.filter(
    (m) => m.group_id === input.to_group_id && inWeek(input.to_week)(m),
  )
  const everyone = target.members.map((member) => member.user_id)
  const copies = mealsToCopy(source, existing).map((m) => {
    const mealId = newId('meal')
    return {
      ...structuredClone(m),
      id: mealId,
      group_id: input.to_group_id,
      attendees: input.to_group_id === input.from_group_id ? m.attendees : everyone,
      reactions: {},
      prep_tasks: m.prep_tasks.map((task) => ({
        ...task,
        id: newId('prep'),
        meal_plan_id: mealId,
        done_by: null,
        done_at: null,
      })),
    }
  })
  state.meals.push(...copies)
  return respond({ copied: copies.length })
}

// ─── Cart ────────────────────────────────────────────────────────────────────────────────

/** GET /plate/grocery-items: every kitchen's cart. */
export async function listGroceries(): Promise<GroceryItem[]> {
  const mine = myKitchenIds()
  return respond(db().groceries.filter((item) => mine.has(item.group_id)))
}

/** POST /plate/kitchens/:id/grocery-items */
export async function addGrocery(input: {
  group_id: string
  name: string
  quantity?: string
  /** Leave out to pick the aisle from the name. */
  aisle?: Aisle
  meal_plan_id?: string | null
}): Promise<GroceryItem> {
  findKitchen(input.group_id)
  const name = input.name.trim()
  if (!name) throw new PlateApiError('Name the item.')
  const item: GroceryItem = {
    id: newId('item'),
    group_id: input.group_id,
    name,
    quantity: input.quantity?.trim() ?? '',
    aisle: input.aisle ?? guessAisle(name),
    meal_plan_id: input.meal_plan_id ?? null,
    added_by: ME,
    checked_by: null,
    checked_at: null,
  }
  db().groceries.push(item)
  return respond(item)
}

/** PATCH /plate/grocery-items/:id { checked } */
export async function setGroceryChecked(id: string, checked: boolean): Promise<GroceryItem> {
  const item = db().groceries.find((g) => g.id === id && myKitchenIds().has(g.group_id))
  if (!item) throw new PlateApiError('That item was removed.')
  item.checked_by = checked ? ME : null
  item.checked_at = checked ? now() : null
  return respond(item)
}

/** DELETE /plate/grocery-items/:id */
export async function deleteGrocery(id: string): Promise<void> {
  db().groceries = db().groceries.filter((g) => g.id !== id)
  return respond(undefined)
}

/** POST /plate/grocery-items/clear-checked { group_ids } */
export async function clearChecked(groupIds: string[]): Promise<void> {
  const groups = new Set(groupIds)
  db().groceries = db().groceries.filter((g) => !(groups.has(g.group_id) && g.checked_at))
  return respond(undefined)
}

// ─── Recipe import ───────────────────────────────────────────────────────────────────────

export interface ImportedRecipe {
  title: string
  ingredients: string[]
}

/**
 * POST /plate/recipes/import { url }: the backend fetches the page and pulls out the name and
 * ingredients. The mock reads the name from the link and knows a few demo ingredient lists.
 */
export async function importRecipe(url: string): Promise<ImportedRecipe> {
  const title = titleFromRecipeUrl(url)
  if (!title) throw new PlateApiError("That link doesn't look like a recipe page.")
  const known = Object.entries(DEMO_INGREDIENTS).find(([word]) =>
    title.toLowerCase().includes(word),
  )
  return respond({ title, ingredients: known?.[1] ?? [] })
}

const DEMO_INGREDIENTS: Record<string, string[]> = {
  paneer: ['Paneer (400g)', 'Tomatoes (500g)', 'Cream', 'Kasuri methi'],
  rajma: ['Rajma (500g)', 'Onions (1 kg)', 'Tomatoes (500g)'],
  biryani: ['Basmati rice (1 kg)', 'Chicken (1 kg)', 'Curd', 'Biryani masala'],
  dal: ['Toor dal (500g)', 'Tomatoes (500g)', 'Ghee'],
  pasta: ['Penne (500g)', 'Tomatoes (500g)', 'Garlic', 'Parmesan'],
}

// ─── Ideas ───────────────────────────────────────────────────────────────────────────────

/** GET /plate/ideas */
export async function listIdeas(): Promise<Idea[]> {
  const mine = myKitchenIds()
  return respond(db().ideas.filter((idea) => mine.has(idea.group_id)))
}

/** POST /plate/kitchens/:id/ideas */
export async function saveIdea(input: {
  group_id: string
  title: string
  recipe_url: string | null
}): Promise<Idea> {
  const kitchen = findKitchen(input.group_id)
  const title = input.title.trim()
  if (!title) throw new PlateApiError('Name the idea.')
  const idea: Idea = {
    id: newId('idea'),
    group_id: kitchen.id,
    title,
    added_by: ME,
    // Saving an idea in a shared kitchen counts as your vote for it.
    votes: kitchen.is_personal ? [] : [ME],
    recipe_url: input.recipe_url?.trim() || null,
    created_at: now(),
  }
  db().ideas.push(idea)
  return respond(idea)
}

/** PUT /plate/ideas/:id/vote { voted } */
export async function setIdeaVote(id: string, voted: boolean): Promise<Idea> {
  const idea = db().ideas.find((i) => i.id === id)
  if (!idea) throw new PlateApiError('That idea was removed.')
  if (findKitchen(idea.group_id).is_personal)
    throw new PlateApiError('Wishlist ideas have no votes.')
  idea.votes = voted ? [...new Set([...idea.votes, ME])] : idea.votes.filter((user) => user !== ME)
  return respond(idea)
}

/** DELETE /plate/ideas/:id */
export async function deleteIdea(id: string): Promise<void> {
  db().ideas = db().ideas.filter((i) => i.id !== id)
  return respond(undefined)
}

// ─── Settings ────────────────────────────────────────────────────────────────────────────

/** GET /plate/settings */
export async function getSettings(): Promise<PlateSettings> {
  return respond(db().settings)
}

/** PATCH /plate/settings */
export async function updateSettings(patch: Partial<PlateSettings>): Promise<PlateSettings> {
  const state = db()
  if (patch.default_group_id) findKitchen(patch.default_group_id)
  if (patch.reminder_time && (patch.reminder_time < '19:00' || patch.reminder_time > '22:00'))
    throw new PlateApiError('Pick a reminder time between 7 and 10 PM.')
  Object.assign(state.settings, patch)
  return respond(state.settings)
}
