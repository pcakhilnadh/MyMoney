import { describe, expect, it } from 'vitest'
import {
  inSelection,
  mealLabel,
  nextEmptySlot,
  isMyPrep,
  mealsIAmEating,
  mealsToCopy,
  orderKitchens,
  prepChecklist,
  prepProgress,
  sortIdeas,
  titleFromRecipeUrl,
} from './logic'
import type { Idea, Kitchen, Meal, PrepTask } from './types'

const ME = 'me'
const TODAY = '2026-11-20'
const TOMORROW = '2026-11-21'

const task = (title: string, done = false): PrepTask => ({
  id: title,
  meal_plan_id: 'm',
  title,
  sort_order: 0,
  done_by: done ? ME : null,
  done_at: done ? '2026-11-20T10:00:00Z' : null,
})

function kitchen(id: string, partial: Partial<Kitchen> = {}): Kitchen {
  return {
    id,
    name: id,
    emoji: '🏡',
    group_type: 'couple',
    is_personal: false,
    owner_id: ME,
    color: '#fff',
    meal_slots: ['B', 'L', 'D'],
    timezone: 'Asia/Kolkata',
    members: [{ user_id: ME, role: 'owner', color: '#fff' }],
    invited: [],
    shopping_now: [],
    shopping_since: {},
    has_new_activity: false,
    ...partial,
  }
}

const idea = (id: string, votes: string[], created_at: string, group_id = 'home'): Idea => ({
  id,
  group_id,
  title: id,
  added_by: ME,
  votes,
  recipe_url: null,
  created_at,
})

function meal(partial: Partial<Meal>): Meal {
  return {
    id: 'm',
    group_id: 'k',
    meal_date: TODAY,
    meal_slot: 'D',
    title: 'Dal',
    sides: [],
    leftover_of: null,
    chef_type: 'MEMBER',
    chef_user_id: ME,
    attendees: [ME],
    guest_count: 0,
    reactions: {},
    recipe_url: null,
    prep_tasks: [],
    ...partial,
  }
}

describe('MyPlate logic', () => {
  it("lists today's meals across kitchens only where I'm eating", () => {
    const meals = [
      meal({ id: 'dinner', group_id: 'home', meal_slot: 'D' }),
      meal({ id: 'breakfast', group_id: 'mine', meal_slot: 'B' }),
      meal({ id: 'theirs', group_id: 'flat', meal_slot: 'L', attendees: ['maya'] }),
      meal({ id: 'tomorrow', meal_date: TOMORROW }),
    ]
    expect(mealsIAmEating(meals, TODAY, ME).map((m) => m.id)).toEqual(['breakfast', 'dinner'])
  })

  it('puts prep on the cook, or everyone eating when cooked together', () => {
    expect(isMyPrep(meal({}), ME)).toBe(true)
    expect(isMyPrep(meal({ chef_user_id: 'maya' }), ME)).toBe(false)
    expect(isMyPrep(meal({ chef_type: 'TOGETHER', chef_user_id: null }), ME)).toBe(true)
    expect(
      isMyPrep(meal({ chef_type: 'TOGETHER', chef_user_id: null, attendees: ['maya'] }), ME),
    ).toBe(false)
    expect(isMyPrep(meal({ chef_type: 'TAKEOUT', chef_user_id: null }), ME)).toBe(false)
  })

  it("builds tomorrow's checklist from my meals and counts open tasks", () => {
    const meals = [
      meal({
        id: 'rajma',
        meal_date: TOMORROW,
        prep_tasks: [task('Soak rajma'), task('Chop', true)],
      }),
      meal({ id: 'oats', meal_date: TOMORROW, meal_slot: 'B', prep_tasks: [task('Soak oats')] }),
      meal({ id: 'mayas', meal_date: TOMORROW, chef_user_id: 'maya', prep_tasks: [task('x')] }),
      meal({ id: 'none', meal_date: TOMORROW, meal_slot: 'L' }),
    ]
    const list = prepChecklist(meals, TOMORROW, ME)
    expect(list.map((m) => m.id)).toEqual(['oats', 'rajma'])
    expect(prepProgress(list)).toEqual({ done: 1, total: 3, open: 2 })
  })

  it('copies a week into empty slots only', () => {
    const source = [
      meal({ id: 'a', meal_slot: 'B' }),
      meal({ id: 'b', meal_slot: 'D' }),
      meal({ id: 'c', meal_date: TOMORROW }),
    ]
    const target = [meal({ id: 'x', group_id: 'shared', meal_slot: 'D' })]
    expect(mealsToCopy(source, target).map((m) => m.id)).toEqual(['a', 'c'])
  })

  it('ranks shared ideas by votes and keeps the wishlist newest first', () => {
    const kitchens = [kitchen('home'), kitchen('mine', { is_personal: true })]
    const shared = [idea('one', ['a'], '2026-01-03'), idea('two', ['a', 'b'], '2026-01-01')]
    expect(sortIdeas(shared, kitchens).map((i) => i.id)).toEqual(['two', 'one'])
    const wishlist = [idea('old', [], '2026-01-01', 'mine'), idea('new', [], '2026-02-01', 'mine')]
    expect(sortIdeas(wishlist, kitchens).map((i) => i.id)).toEqual(['new', 'old'])
    expect(inSelection(shared, 'mine')).toEqual([])
  })

  it('pins My Kitchen, then the default kitchen', () => {
    const kitchens = [kitchen('Home'), kitchen('Flat'), kitchen('Me', { is_personal: true })]
    expect(orderKitchens(kitchens, 'Home').map((k) => k.id)).toEqual(['Me', 'Home', 'Flat'])
  })

  it('reads a title out of a recipe link', () => {
    expect(titleFromRecipeUrl('https://site.com/recipes/paneer-butter-masala-123')).toBe(
      'Paneer butter masala',
    )
    expect(titleFromRecipeUrl('not a url')).toBeNull()
  })
})

describe('guessAisle', () => {
  it('maps common items and falls back to Other', async () => {
    const { guessAisle } = await import('./logic')
    expect(guessAisle('Paneer')).toBe('Dairy & Eggs')
    expect(guessAisle('Red onions')).toBe('Fresh Produce')
    expect(guessAisle('Toor dal')).toBe('Grains & Pulses')
    expect(guessAisle('Frozen peas')).toBe('Frozen')
    expect(guessAisle('Peanut butter')).toBe('Snacks & Drinks')
    expect(guessAisle('Candles')).toBe('Other')
  })
})

describe('slots and labels', () => {
  it('finds the next empty slot in a kitchen', () => {
    const planned = [
      meal({ group_id: 'k', meal_slot: 'B' }),
      meal({ group_id: 'k', meal_slot: 'L' }),
    ]
    const kitchen = { id: 'k', meal_slots: ['B', 'L', 'D'] as const }
    expect(
      nextEmptySlot(planned, { ...kitchen, meal_slots: [...kitchen.meal_slots] }, [
        TODAY,
        TOMORROW,
      ]),
    ).toEqual({
      date: TODAY,
      slot: 'D',
    })
  })

  it('names a meal by day and slot', () => {
    expect(mealLabel({ meal_date: TODAY, meal_slot: 'D' })).toBe('Fri Dinner')
  })
})
