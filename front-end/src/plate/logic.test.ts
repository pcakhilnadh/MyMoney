import { describe, expect, it } from 'vitest'
import { createMockDb, ME } from './mockData'
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
import type { Meal } from './types'

const TODAY = '2026-11-20'
const TOMORROW = '2026-11-21'

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
    const db = createMockDb(TODAY)
    const today = mealsIAmEating(db.meals, TODAY, ME)
    expect(today.map((m) => m.meal_slot)).toEqual(['B', 'L', 'D'])
    expect(new Set(today.map((m) => m.group_id))).toEqual(new Set(['k-me', 'k-home']))
    expect(mealsIAmEating([meal({ attendees: ['maya'] })], TODAY, ME)).toEqual([])
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
    const db = createMockDb(TODAY)
    const list = prepChecklist(db.meals, TOMORROW, ME)
    expect(list.map((m) => m.title)).toEqual(['Overnight oats', 'Rajma chawal', 'Egg fried rice'])
    expect(prepProgress(list)).toEqual({ done: 2, total: 6, open: 4 })
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
    const db = createMockDb(TODAY)
    const home = sortIdeas(inSelection(db.ideas, 'k-home'), db.kitchens)
    expect(home.map((i) => i.votes.length)).toEqual([2, 1])
    const wishlist = sortIdeas(
      [
        { ...db.ideas[0], id: 'old', created_at: '2026-01-01', votes: [] },
        { ...db.ideas[0], id: 'new', created_at: '2026-02-01', votes: [] },
      ],
      db.kitchens,
    )
    expect(wishlist.map((i) => i.id)).toEqual(['new', 'old'])
  })

  it('pins My Kitchen, then the default kitchen', () => {
    const db = createMockDb(TODAY)
    const mine = db.kitchens.filter((k) => k.members.some((m) => m.user_id === ME))
    expect(orderKitchens(mine, 'k-flat').map((k) => k.id)).toEqual([
      'k-me',
      'k-flat',
      'k-home',
      'k-family',
      'k-trek',
    ])
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
