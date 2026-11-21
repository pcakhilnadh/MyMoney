/**
 * What MyPlate's screens call. Everyday changes (meals, prep ticks, cart, ideas, votes,
 * settings) are saved to the local database at once and queued; sync sends them in the
 * background, so nothing waits on the network and it all works offline. The rules mirror
 * the server's (`routers_plate.py`), which still has the final say.
 *
 * Kitchens, invites, going live and recipe import need the server's answer, so they call it
 * directly and say so when offline.
 */
import { requestSync } from '@/sync/bus'
import { addDays, parseDateKey } from './dates'
import { guessAisle, SLOT_ORDER } from './logic'
import * as remote from './remote'
import { plateDb, type OutboxCommand } from './store'
import type {
  Aisle,
  GroceryItem,
  Idea,
  Kitchen,
  Meal,
  MealDraft,
  PlateSettings,
  PrepTask,
  Reaction,
  UserId,
} from './types'

export type { ImportedRecipe, KitchenInput } from './remote'

const id = (value: string) => encodeURIComponent(value)
const newId = () => crypto.randomUUID()
const now = () => new Date().toISOString()

async function myId(): Promise<UserId> {
  const me = await plateDb.getMeta('me')
  if (!me) throw new Error('MyPlate is still loading. Try again in a moment.')
  return me.id
}

async function kitchenOf(kitchenId: string): Promise<Kitchen> {
  const kitchen = await plateDb.kitchens.get(kitchenId)
  if (!kitchen) throw new Error('That kitchen is no longer available.')
  return kitchen
}

/** Save locally and queue the change in one step, then sync in the background. */
async function saveLocally<T>(change: () => Promise<T>): Promise<T> {
  const tables = [
    plateDb.kitchens,
    plateDb.meals,
    plateDb.grocery_items,
    plateDb.ideas,
    plateDb.meta,
    plateDb.outbox,
  ]
  const result = await plateDb.transaction('rw', tables, change)
  requestSync('plate')
  return result
}

const queue = (command: OutboxCommand) => plateDb.outbox.add(command)

const OFFLINE = 'You’re offline. Connect to the internet to do this.'

/** Actions that need the server's answer. */
async function online<T>(call: () => Promise<T>): Promise<T> {
  if (!navigator.onLine) throw new Error(OFFLINE)
  try {
    const result = await call()
    requestSync('plate')
    return result
  } catch (error) {
    // fetch rejects with a TypeError when the network is unreachable.
    throw error instanceof TypeError ? new Error(OFFLINE) : error
  }
}

const putKitchens = (kitchens: Kitchen[]) =>
  plateDb.transaction('rw', plateDb.kitchens, async () => {
    for (const kitchen of kitchens) {
      const position = (await plateDb.kitchens.get(kitchen.id))?.position ?? Date.now()
      await plateDb.kitchens.put({ ...kitchen, position })
    }
  })

async function dropKitchen(kitchenId: string) {
  const tables = [
    plateDb.kitchens,
    plateDb.meals,
    plateDb.grocery_items,
    plateDb.ideas,
    plateDb.meta,
  ]
  await plateDb.transaction('rw', tables, async () => {
    await plateDb.kitchens.delete(kitchenId)
    for (const table of [plateDb.meals, plateDb.grocery_items, plateDb.ideas])
      await table.where('group_id').equals(kitchenId).delete()
    const settings = await plateDb.getMeta('settings')
    if (settings?.default_group_id === kitchenId)
      await plateDb.setMeta('settings', { ...settings, default_group_id: null })
  })
}

// ─── Kitchens (need the server) ──────────────────────────────────────────────────────────

export const createKitchen = (input: remote.KitchenInput) =>
  online(async () => {
    const kitchen = await remote.createKitchen(input)
    await putKitchens([kitchen])
    return kitchen
  })

/** Name, icon, type and meal slots. Saved on the phone at once, sent in the background. */
export const updateKitchen = (kitchenId: string, patch: remote.KitchenPatch) =>
  saveLocally(async () => {
    const kitchen = await kitchenOf(kitchenId)
    if (kitchen.is_personal) throw new Error('My Kitchen can’t be changed.')
    if (patch.name !== undefined && !patch.name.trim()) throw new Error('Name the kitchen.')
    if (patch.meal_slots && patch.meal_slots.length === 0)
      throw new Error('Pick at least one meal.')
    const next: Kitchen = {
      ...kitchen,
      ...patch,
      ...(patch.name !== undefined && { name: patch.name.trim() }),
      ...(patch.meal_slots && {
        meal_slots: SLOT_ORDER.filter((slot) => patch.meal_slots!.includes(slot)),
      }),
    }
    await plateDb.kitchens.put(next)
    await queue({
      method: 'PATCH',
      path: `/kitchens/${id(kitchenId)}`,
      body: patch,
      entity: 'kitchens',
      entity_id: kitchenId,
    })
    return next
  })

/** Clears the "new activity" marker. Works offline. */
export const markKitchenSeen = (kitchenId: string) =>
  saveLocally(async () => {
    await plateDb.kitchens.update(kitchenId, { has_new_activity: false })
    await queue({
      method: 'POST',
      path: `/kitchens/${id(kitchenId)}/seen`,
      entity: 'kitchens',
      entity_id: kitchenId,
    })
  })

/** My Kitchen can't be left. */
export const leaveKitchen = (kitchenId: string) =>
  online(async () => {
    await remote.leaveKitchen(kitchenId)
    await dropKitchen(kitchenId)
  })

/** Owner only. Removes its meals, cart and ideas too. */
export const deleteKitchen = (kitchenId: string) =>
  online(async () => {
    await remote.deleteKitchen(kitchenId)
    await dropKitchen(kitchenId)
  })

/** Go live as shopping (or stop) in each kitchen. Presence lapses after an hour. */
export const setShopping = (kitchenIds: string[], shopping: boolean) =>
  online(async () => {
    const kitchens = await remote.setShopping(kitchenIds, shopping)
    await putKitchens(kitchens)
    return kitchens
  })

// ─── Invites (need the server) ───────────────────────────────────────────────────────────

export const acceptInvite = (inviteId: string) =>
  online(async () => {
    const kitchen = await remote.acceptInvite(inviteId)
    await putKitchens([kitchen])
    await plateDb.invites.delete(inviteId)
    return kitchen
  })

export const declineInvite = (inviteId: string) =>
  online(async () => {
    await remote.declineInvite(inviteId)
    await plateDb.invites.delete(inviteId)
  })

export const joinWithCode = (code: string) =>
  online(async () => {
    const kitchen = await remote.joinWithCode(code)
    await putKitchens([kitchen])
    return kitchen
  })

export const inviteByEmail = (kitchenId: string, emails: string[]) =>
  online(async () => {
    const kitchen = await remote.inviteByEmail(kitchenId, emails)
    await putKitchens([kitchen])
    return kitchen
  })

/** The kitchen's open code, created once. */
export const getInviteCode = (kitchenId: string) => online(() => remote.getInviteCode(kitchenId))

export const importRecipe = (url: string) => online(() => remote.importRecipe(url))

// ─── Meals ───────────────────────────────────────────────────────────────────────────────

const NO_PREP = new Set(['TAKEOUT', 'EATING_OUT'])

/** The meal as the server will store it (same rules as `_apply_meal`). */
function buildMeal(
  mealId: string,
  draft: MealDraft,
  kitchen: Kitchen,
  me: UserId,
  existing: Meal | undefined,
): Meal {
  const title = draft.title.trim()
  if (!title) throw new Error('Give the meal a name.')
  if (kitchen.is_personal && draft.chef_type === 'TOGETHER')
    throw new Error('Cooking together needs a shared kitchen.')
  const members = new Set(kitchen.members.map((m) => m.user_id))
  const attendees = kitchen.is_personal
    ? [me]
    : [...new Set(draft.attendees)].filter((user) => members.has(user))
  if (attendees.length === 0 && draft.guest_count === 0)
    throw new Error('Pick at least one person who is eating.')
  if (draft.leftover_of === mealId) throw new Error('The original meal was removed.')

  const noPrep = draft.leftover_of !== null || NO_PREP.has(draft.chef_type)
  const ticks = new Map((existing?.prep_tasks ?? []).map((task) => [task.id, task]))
  const prep_tasks: PrepTask[] = (noPrep ? [] : draft.prep_tasks)
    .filter((task) => task.title.trim())
    .map((task, sort_order) => {
      const kept = task.id ? ticks.get(task.id) : undefined
      return {
        id: task.id ?? newId(),
        meal_plan_id: mealId,
        title: task.title.trim(),
        sort_order,
        done_by: kept?.done_by ?? null,
        done_at: kept?.done_at ?? null,
      }
    })
  return {
    id: mealId,
    group_id: kitchen.id,
    meal_date: draft.meal_date,
    meal_slot: draft.meal_slot,
    title,
    sides: draft.sides.map((side) => side.trim().slice(0, 80)).filter(Boolean),
    leftover_of: draft.leftover_of,
    chef_type: draft.chef_type,
    chef_user_id:
      draft.chef_type === 'MEMBER'
        ? !kitchen.is_personal && draft.chef_user_id && members.has(draft.chef_user_id)
          ? draft.chef_user_id
          : me
        : null,
    attendees,
    guest_count: draft.guest_count,
    reactions: existing?.reactions ?? {},
    recipe_url: draft.recipe_url?.trim() || null,
    prep_tasks,
    created_at: existing?.created_at ?? now(),
  }
}

/** What POST/PUT /meals take. */
const mealBody = (meal: Meal) => ({
  group_id: meal.group_id,
  meal_date: meal.meal_date,
  meal_slot: meal.meal_slot,
  title: meal.title,
  sides: meal.sides,
  leftover_of: meal.leftover_of,
  chef_type: meal.chef_type,
  chef_user_id: meal.chef_user_id,
  attendees: meal.attendees,
  guest_count: meal.guest_count,
  recipe_url: meal.recipe_url,
  prep_tasks: meal.prep_tasks.map((task) => ({ id: task.id, title: task.title })),
})

async function addMeal(meal: Meal) {
  await plateDb.meals.put(meal)
  await queue({
    method: 'POST',
    path: '/meals',
    body: { id: meal.id, ...mealBody(meal) },
    entity: 'meals',
    entity_id: meal.id,
  })
}

/** Creates the meal, or updates it when `id` is set. */
export const saveMeal = ({ id: mealId, ...draft }: MealDraft & { id?: string }) =>
  saveLocally(async () => {
    const [me, kitchen] = await Promise.all([myId(), kitchenOf(draft.group_id)])
    const existing = mealId ? await plateDb.meals.get(mealId) : undefined
    if (mealId && !existing) throw new Error('That meal was removed.')
    if (existing && existing.group_id !== draft.group_id)
      throw new Error('Meals can’t move between kitchens.')
    const meal = buildMeal(mealId ?? newId(), draft, kitchen, me, existing)
    if (!existing) {
      await addMeal(meal)
      return meal
    }
    await plateDb.meals.put(meal)
    await queue({
      method: 'PUT',
      path: `/meals/${id(meal.id)}`,
      body: mealBody(meal),
      entity: 'meals',
      entity_id: meal.id,
    })
    return meal
  })

export const deleteMeal = (mealId: string) =>
  saveLocally(async () => {
    // Removing a meal removes the leftovers planned from it (the server does the same).
    const gone = [
      mealId,
      ...(await plateDb.meals.filter((m) => m.leftover_of === mealId).primaryKeys()),
    ]
    await plateDb.meals.bulkDelete(gone)
    await plateDb.grocery_items
      .filter((item) => item.meal_plan_id !== null && gone.includes(item.meal_plan_id))
      .modify({ meal_plan_id: null })
    await queue({
      method: 'DELETE',
      path: `/meals/${id(mealId)}`,
      entity: 'meals',
      entity_id: mealId,
    })
  })

const rank = (slot: Meal['meal_slot']) => SLOT_ORDER.indexOf(slot)

/** Plans the meal's leftovers in the next empty slot within three days. */
export const planLeftovers = (mealId: string) =>
  saveLocally(async () => {
    const original = await plateDb.meals.get(mealId)
    if (!original) throw new Error('That meal was removed.')
    const kitchen = await kitchenOf(original.group_id)
    const days = [0, 1, 2, 3].map((offset) => addDays(original.meal_date, offset))
    const taken = new Set(
      (await plateDb.meals.where('group_id').equals(kitchen.id).toArray())
        .filter((m) => days.includes(m.meal_date))
        .map((m) => `${m.meal_date}|${m.meal_slot}`),
    )
    const slots = SLOT_ORDER.filter((slot) => kitchen.meal_slots.includes(slot))
    const target = days
      .flatMap((date, offset) => slots.map((slot) => ({ date, slot, offset })))
      .find(
        ({ date, slot, offset }) =>
          (offset > 0 || rank(slot) > rank(original.meal_slot)) && !taken.has(`${date}|${slot}`),
      )
    if (!target) throw new Error('No free slot in the next three days for leftovers.')
    const base = original.title.replace(/ \(leftovers\)$/, '')
    const meal: Meal = {
      ...original,
      id: newId(),
      meal_date: target.date,
      meal_slot: target.slot,
      title: `${base} (leftovers)`.slice(0, 120),
      leftover_of: original.id,
      // A meal with only guests still needs someone eating its leftovers.
      guest_count: original.attendees.length ? 0 : original.guest_count,
      reactions: {},
      prep_tasks: [],
      created_at: now(),
    }
    await addMeal(meal)
    return meal
  })

export const setReaction = (mealId: string, reaction: Reaction | null) =>
  saveLocally(async () => {
    const [me, meal] = await Promise.all([myId(), plateDb.meals.get(mealId)])
    if (!meal) throw new Error('That meal was removed.')
    if ((await kitchenOf(meal.group_id)).is_personal)
      throw new Error('Reactions are for shared kitchens.')
    const reactions = { ...meal.reactions }
    if (reaction) reactions[me] = reaction
    else delete reactions[me]
    const next = { ...meal, reactions }
    await plateDb.meals.put(next)
    await queue({
      method: 'PUT',
      path: `/meals/${id(mealId)}/reaction`,
      body: { reaction },
      entity: 'meals',
      entity_id: mealId,
    })
    return next
  })

export const setPrepTaskDone = (taskId: string, done: boolean) =>
  saveLocally(async () => {
    const me = await myId()
    const meal = await plateDb.meals
      .filter((m) => m.prep_tasks.some((t) => t.id === taskId))
      .first()
    if (!meal) throw new Error('That task was removed.')
    const next = {
      ...meal,
      prep_tasks: meal.prep_tasks.map((task) =>
        task.id === taskId
          ? { ...task, done_by: done ? me : null, done_at: done ? now() : null }
          : task,
      ),
    }
    await plateDb.meals.put(next)
    await queue({
      method: 'PATCH',
      path: `/prep-tasks/${id(taskId)}`,
      body: { done },
      entity: 'meals',
      entity_id: meal.id,
    })
    return next
  })

const daysBetween = (from: string, to: string) =>
  Math.round((parseDateKey(to).getTime() - parseDateKey(from).getTime()) / 86_400_000)

/**
 * Copies one week into the empty slots of another week or kitchen; originals stay put.
 * "Copy last week" copies a kitchen's previous week into this one. Same rules as the server's copy-week.
 */
export const copyWeek = (input: {
  from_group_id: string
  to_group_id: string
  from_week: string
  to_week: string
}) =>
  saveLocally(async () => {
    const [me, target] = await Promise.all([myId(), kitchenOf(input.to_group_id)])
    await kitchenOf(input.from_group_id)
    const inWeek = (start: string) => (m: Meal) =>
      m.meal_date >= start && m.meal_date <= addDays(start, 6)
    const source = (await plateDb.meals.where('group_id').equals(input.from_group_id).toArray())
      .filter((m) => inWeek(input.from_week)(m) && !m.leftover_of)
      .sort(
        (a, b) =>
          a.meal_date.localeCompare(b.meal_date) ||
          (a.created_at ?? '').localeCompare(b.created_at ?? ''),
      )
    const taken = new Set(
      (await plateDb.meals.where('group_id').equals(target.id).toArray())
        .filter(inWeek(input.to_week))
        .map((m) => `${m.meal_date}|${m.meal_slot}`),
    )
    const shift = daysBetween(input.from_week, input.to_week)
    const members = target.members.map((m) => m.user_id)
    const same = input.from_group_id === target.id
    let copied = 0
    for (const meal of source) {
      const date = addDays(meal.meal_date, shift)
      const key = `${date}|${meal.meal_slot}`
      if (taken.has(key)) continue
      taken.add(key)
      const chef_type =
        target.is_personal && meal.chef_type === 'TOGETHER' ? 'MEMBER' : meal.chef_type
      const chef = meal.chef_user_id && members.includes(meal.chef_user_id) ? meal.chef_user_id : me
      const copyId = newId()
      await addMeal({
        ...meal,
        id: copyId,
        group_id: target.id,
        meal_date: date,
        chef_type,
        chef_user_id: chef_type === 'MEMBER' ? chef : null,
        attendees: same ? meal.attendees : target.is_personal ? [me] : members,
        reactions: {},
        prep_tasks: meal.prep_tasks.map((task) => ({
          ...task,
          id: newId(),
          meal_plan_id: copyId,
          done_by: null,
          done_at: null,
        })),
        created_at: now(),
      })
      copied += 1
    }
    return { copied }
  })

// ─── Cart ────────────────────────────────────────────────────────────────────────────────

export const addGrocery = (input: {
  group_id: string
  name: string
  quantity?: string
  /** Leave out to have the aisle picked from the name. */
  aisle?: Aisle
  meal_plan_id?: string | null
}) =>
  saveLocally(async () => {
    const [me] = await Promise.all([myId(), kitchenOf(input.group_id)])
    const name = input.name.trim()
    if (!name) throw new Error('Name the item.')
    const item: GroceryItem = {
      id: newId(),
      group_id: input.group_id,
      name,
      quantity: (input.quantity ?? '').trim(),
      aisle: input.aisle ?? guessAisle(name),
      meal_plan_id: input.meal_plan_id ?? null,
      added_by: me,
      checked_by: null,
      checked_at: null,
      created_at: now(),
    }
    await plateDb.grocery_items.put(item)
    await queue({
      method: 'POST',
      path: '/grocery-items',
      body: {
        id: item.id,
        group_id: item.group_id,
        name: item.name,
        quantity: item.quantity,
        aisle: item.aisle,
        meal_plan_id: item.meal_plan_id,
      },
      entity: 'grocery_items',
      entity_id: item.id,
    })
    return item
  })

export const setGroceryChecked = (itemId: string, checked: boolean) =>
  saveLocally(async () => {
    const [me, item] = await Promise.all([myId(), plateDb.grocery_items.get(itemId)])
    if (!item) throw new Error('That item was removed.')
    const next = { ...item, checked_by: checked ? me : null, checked_at: checked ? now() : null }
    await plateDb.grocery_items.put(next)
    await queue({
      method: 'PATCH',
      path: `/grocery-items/${id(itemId)}`,
      body: { checked },
      entity: 'grocery_items',
      entity_id: itemId,
    })
    return next
  })

export const deleteGrocery = (itemId: string) =>
  saveLocally(async () => {
    await plateDb.grocery_items.delete(itemId)
    await queue({
      method: 'DELETE',
      path: `/grocery-items/${id(itemId)}`,
      entity: 'grocery_items',
      entity_id: itemId,
    })
  })

export const clearChecked = (kitchenIds: string[]) =>
  saveLocally(async () => {
    await plateDb.grocery_items
      .filter((item) => kitchenIds.includes(item.group_id) && item.checked_at !== null)
      .delete()
    await queue({
      method: 'POST',
      path: '/grocery-items/clear-checked',
      body: { group_ids: kitchenIds },
    })
  })

// ─── Ideas ───────────────────────────────────────────────────────────────────────────────

export const saveIdea = (input: { group_id: string; title: string; recipe_url: string | null }) =>
  saveLocally(async () => {
    const [me, kitchen] = await Promise.all([myId(), kitchenOf(input.group_id)])
    const title = input.title.trim()
    if (!title) throw new Error('Name the idea.')
    const idea: Idea = {
      id: newId(),
      group_id: kitchen.id,
      title,
      added_by: me,
      // Suggesting an idea in a shared kitchen counts as your vote for it.
      votes: kitchen.is_personal ? [] : [me],
      recipe_url: input.recipe_url?.trim() || null,
      created_at: now(),
    }
    await plateDb.ideas.put(idea)
    await queue({
      method: 'POST',
      path: '/ideas',
      body: { id: idea.id, group_id: idea.group_id, title, recipe_url: idea.recipe_url },
      entity: 'ideas',
      entity_id: idea.id,
    })
    return idea
  })

export const setIdeaVote = (ideaId: string, voted: boolean) =>
  saveLocally(async () => {
    const [me, idea] = await Promise.all([myId(), plateDb.ideas.get(ideaId)])
    if (!idea) throw new Error('That idea was removed.')
    if ((await kitchenOf(idea.group_id)).is_personal)
      throw new Error('Wishlist ideas have no votes.')
    const others = idea.votes.filter((user) => user !== me)
    const next = { ...idea, votes: voted ? [...others, me] : others }
    await plateDb.ideas.put(next)
    await queue({
      method: 'PUT',
      path: `/ideas/${id(ideaId)}/vote`,
      body: { voted },
      entity: 'ideas',
      entity_id: ideaId,
    })
    return next
  })

export const deleteIdea = (ideaId: string) =>
  saveLocally(async () => {
    const [me, idea] = await Promise.all([myId(), plateDb.ideas.get(ideaId)])
    if (!idea) return
    const kitchen = await kitchenOf(idea.group_id)
    if (idea.added_by !== me && kitchen.owner_id !== me)
      throw new Error('Only whoever suggested it, or the kitchen owner, can remove it.')
    await plateDb.ideas.delete(ideaId)
    await queue({
      method: 'DELETE',
      path: `/ideas/${id(ideaId)}`,
      entity: 'ideas',
      entity_id: ideaId,
    })
  })

// ─── Settings ────────────────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: PlateSettings = {
  default_group_id: null,
  reminder_enabled: true,
  reminder_time: '20:00',
}

export const updateSettings = (patch: Partial<PlateSettings>) =>
  saveLocally(async () => {
    if (patch.reminder_time && !(patch.reminder_time >= '19:00' && patch.reminder_time <= '22:00'))
      throw new Error('Pick a reminder time between 7 and 10 PM.')
    if (patch.default_group_id) await kitchenOf(patch.default_group_id)
    const settings = { ...((await plateDb.getMeta('settings')) ?? DEFAULT_SETTINGS), ...patch }
    await plateDb.setMeta('settings', settings)
    await queue({ method: 'PATCH', path: '/settings', body: patch, entity: 'settings' })
    return settings
  })
