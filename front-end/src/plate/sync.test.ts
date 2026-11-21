import 'fake-indexeddb/auto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setAccessToken } from '@/auth/api'
import * as api from './api'
import { plateDb } from './store'
import type { PlatePull } from './remote'
import { flushOutbox, mergePull, runPlateSync } from './sync'
import type { Kitchen, Meal } from './types'

const ME = 'me'
const BOB = 'bob'

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
    members: [
      { user_id: ME, role: 'owner', color: '#fff' },
      { user_id: BOB, role: 'member', color: '#000' },
    ],
    invited: [],
    shopping_now: [],
    shopping_since: {},
    has_new_activity: false,
    ...partial,
  }
}

const mine = kitchen('mine', { is_personal: true, group_type: 'personal', members: [] })
const home = kitchen('home')

function pulled(partial: Partial<PlatePull> = {}): PlatePull {
  return {
    server_time: '2026-11-21T10:00:00+00:00',
    me: { id: ME, name: 'Me' },
    people: [{ id: ME, name: 'Me' }],
    contact_ids: [],
    kitchens: [mine, home],
    invites: [],
    settings: { default_group_id: null, reminder_enabled: true, reminder_time: '20:00' },
    full_kitchens: [],
    meals_from: '2026-09-26',
    meals: [],
    grocery_items: [],
    ideas: [],
    deleted: { meals: [], grocery_items: [], ideas: [] },
    ...partial,
  }
}

const draft = (partial: Partial<Parameters<typeof api.saveMeal>[0]> = {}) => ({
  group_id: 'home',
  meal_date: '2026-11-21',
  meal_slot: 'D' as const,
  title: ' Rajma chawal ',
  sides: [],
  leftover_of: null,
  chef_type: 'MEMBER' as const,
  chef_user_id: null,
  attendees: [ME, BOB],
  guest_count: 0,
  recipe_url: null,
  prep_tasks: [{ title: 'Soak rajma' }],
  ...partial,
})

type Call = { method: string; path: string; body: unknown }

/** Answers the API like the server would, recording each call. */
function serve(answer: (call: Call) => Response | unknown = () => ({})) {
  const calls: Call[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn<typeof fetch>(async (input, init) => {
      const url = new URL(String(input))
      const call = {
        method: init?.method ?? 'GET',
        path: url.pathname + url.search,
        body: init?.body ? JSON.parse(String(init.body)) : undefined,
      }
      calls.push(call)
      const result = answer(call)
      return result instanceof Response
        ? result
        : new Response(JSON.stringify(result ?? {}), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
    }),
  )
  return calls
}

const refuse = (status: number, detail: string) =>
  new Response(JSON.stringify({ detail }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

beforeEach(async () => {
  setAccessToken('token')
  await Promise.all(plateDb.tables.map((table) => table.clear()))
  await mergePull(pulled({ full_kitchens: ['mine', 'home'] }))
})

afterEach(() => {
  vi.unstubAllGlobals()
  setAccessToken(null)
})

describe('saving offline', () => {
  it('saves a meal locally at once with the server’s rules, and queues it', async () => {
    const calls = serve()
    const meal = await api.saveMeal(draft())

    expect(calls).toEqual([])
    const saved = await plateDb.meals.get(meal.id)
    expect(saved?.title).toBe('Rajma chawal')
    expect(saved?.chef_user_id).toBe(ME)
    expect(saved?.prep_tasks.map((t) => t.title)).toEqual(['Soak rajma'])

    const [queued] = await plateDb.outbox.toArray()
    expect(queued).toMatchObject({ method: 'POST', path: '/meals', entity_id: meal.id })
    expect((queued.body as { prep_tasks: { id: string }[] }).prep_tasks[0].id).toBe(
      saved?.prep_tasks[0].id,
    )
  })

  it('applies the same checks as the server before saving', async () => {
    await expect(api.saveMeal(draft({ title: '  ' }))).rejects.toThrow('Give the meal a name.')
    await expect(api.saveMeal(draft({ group_id: 'mine', chef_type: 'TOGETHER' }))).rejects.toThrow(
      'Cooking together needs a shared kitchen.',
    )
    await expect(api.saveMeal(draft({ attendees: [] }))).rejects.toThrow(
      'Pick at least one person who is eating.',
    )
    expect(await plateDb.outbox.count()).toBe(0)

    // My Kitchen is always just me, and takeout has nothing to prep.
    const solo = await api.saveMeal(draft({ group_id: 'mine', attendees: [BOB] }))
    expect(solo.attendees).toEqual([ME])
    const takeout = await api.saveMeal(draft({ chef_type: 'TAKEOUT' }))
    expect(takeout.prep_tasks).toEqual([])
  })

  it('ticks prep, plans leftovers and copies a week without the network', async () => {
    serve()
    const meal = await api.saveMeal(draft({ meal_date: '2026-11-21', meal_slot: 'D' }))
    const ticked = await api.setPrepTaskDone(meal.prep_tasks[0].id, true)
    expect(ticked.prep_tasks[0].done_by).toBe(ME)

    // Dinner's leftovers go to the next free slot: tomorrow's breakfast.
    const leftovers = await api.planLeftovers(meal.id)
    expect([leftovers.meal_date, leftovers.meal_slot]).toEqual(['2026-11-22', 'B'])
    expect(leftovers.title).toBe('Rajma chawal (leftovers)')
    expect(leftovers.prep_tasks).toEqual([])

    const { copied } = await api.copyWeek({
      from_group_id: 'home',
      to_group_id: 'home',
      from_week: '2026-11-16',
      to_week: '2026-11-23',
    })
    expect(copied).toBe(1) // the leftovers stay behind
    const next = (await plateDb.meals.where('meal_date').equals('2026-11-28').toArray())[0]
    expect(next.prep_tasks[0].done_by).toBeNull()
  })

  it('deleting a meal deletes its leftovers and unlinks their cart items', async () => {
    serve()
    const meal = await api.saveMeal(draft())
    const leftovers = await api.planLeftovers(meal.id)
    const item = await api.addGrocery({
      group_id: 'home',
      name: 'Rice',
      meal_plan_id: leftovers.id,
    })

    await api.deleteMeal(meal.id)

    expect(await plateDb.meals.count()).toBe(0)
    expect((await plateDb.grocery_items.get(item.id))?.meal_plan_id).toBeNull()
    expect((await plateDb.outbox.toArray()).at(-1)?.method).toBe('DELETE')
  })

  it('adds cart items with a guessed aisle and keeps ideas votes', async () => {
    const item = await api.addGrocery({ group_id: 'home', name: 'Paneer' })
    expect(item.aisle).toBe('Dairy & Eggs')
    const idea = await api.saveIdea({ group_id: 'home', title: 'Dosa', recipe_url: null })
    expect(idea.votes).toEqual([ME])
    expect((await api.setIdeaVote(idea.id, false)).votes).toEqual([])
  })
})

describe('sync', () => {
  it('replays changes in order, then pulls only what changed since last time', async () => {
    const calls = serve((call) => (call.path.startsWith('/api/v1/sync') ? pulled() : {}))
    const meal = await api.saveMeal(draft())
    await api.deleteMeal(meal.id)

    expect(await runPlateSync()).toEqual({ rejected: 0 })
    expect(calls.map((c) => `${c.method} ${c.path.split('?')[0]}`)).toEqual([
      'POST /api/v1/plate/meals',
      `DELETE /api/v1/plate/meals/${meal.id}`,
      'GET /api/v1/sync/plate/pull',
    ])
    expect(calls[2].path).toContain('since=2026-11-21T10%3A00%3A00%2B00%3A00')
    expect(await plateDb.outbox.count()).toBe(0)
  })

  it('keeps network failures queued for later', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await api.addGrocery({ group_id: 'home', name: 'Milk' })
    await expect(flushOutbox()).rejects.toThrow('Failed to fetch')
    expect(await plateDb.outbox.count()).toBe(1)
  })

  it('drops a refused change and restores the server’s copy with a full pull', async () => {
    const calls = serve((call) => {
      if (call.method === 'POST') return refuse(404, 'That kitchen is no longer available.')
      return pulled({ kitchens: [mine], full_kitchens: ['mine'] })
    })
    await api.addGrocery({ group_id: 'home', name: 'Milk' })

    expect(await runPlateSync()).toEqual({ rejected: 1 })
    expect(calls.at(-1)?.path).toBe('/api/v1/sync/plate/pull')
    expect(await plateDb.grocery_items.count()).toBe(0)
    expect(await plateDb.kitchens.count()).toBe(1)
  })

  it('never overwrites a change that is still waiting to be sent', async () => {
    const meal = await api.saveMeal(draft())
    const serverCopy: Meal = { ...meal, title: 'Old title' }
    const gone = { ...meal, id: 'gone' }
    await plateDb.meals.put(gone)

    await mergePull(
      pulled({ meals: [serverCopy], deleted: { meals: ['gone'], grocery_items: [], ideas: [] } }),
    )
    expect((await plateDb.meals.get(meal.id))?.title).toBe('Rajma chawal')
    expect(await plateDb.meals.get('gone')).toBeUndefined()
  })

  it('drops kitchens I left and replaces kitchens sent whole', async () => {
    await plateDb.grocery_items.bulkPut([
      {
        id: 'a',
        group_id: 'home',
        name: 'A',
        quantity: '',
        aisle: 'Other',
        meal_plan_id: null,
        added_by: BOB,
        checked_by: null,
        checked_at: null,
      },
      {
        id: 'b',
        group_id: 'mine',
        name: 'B',
        quantity: '',
        aisle: 'Other',
        meal_plan_id: null,
        added_by: ME,
        checked_by: null,
        checked_at: null,
      },
    ])
    await mergePull(pulled({ kitchens: [mine], full_kitchens: ['mine'] }))
    expect(await plateDb.grocery_items.count()).toBe(0)
    expect((await plateDb.kitchens.toArray()).map((k) => k.id)).toEqual(['mine'])
  })
})
