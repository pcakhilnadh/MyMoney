/**
 * MyPlate sync. Saved changes wait in the outbox and are replayed in order against the
 * /plate API, which keeps every rule on the server. Then one pull brings what changed in my
 * kitchens since the last sync (other members' meals, ticks, cart, votes, presence).
 */
import { ApiError } from '@/auth/api'
import { plateDb, type OutboxCommand } from './store'
import * as remote from './remote'
import type { PlatePull } from './remote'
import type { Kitchen } from './types'

/** Stop after this many replays so one cycle can't run forever; the next picks up. */
const MAX_REPLAYS = 500

/** The server refused the change itself; retrying won't help. */
const isRejection = (error: unknown) =>
  error instanceof ApiError &&
  error.status >= 400 &&
  error.status < 500 &&
  ![401, 408, 429].includes(error.status)

export interface PlateSyncResult {
  /** Changes the server refused; they were dropped and the local copy restored. */
  rejected: number
}

/** Replays the outbox oldest first. Network or server errors stop it, to retry later. */
export async function flushOutbox(): Promise<PlateSyncResult> {
  let rejected = 0
  for (let i = 0; i < MAX_REPLAYS; i += 1) {
    const command = await plateDb.outbox.orderBy('seq').first()
    if (!command) break
    try {
      await remote.send(command.method, command.path, command.body)
    } catch (error) {
      if (!isRejection(error)) throw error
      // Deleting something that's already gone is what we wanted.
      if (!(command.method === 'DELETE' && (error as ApiError).status === 404)) rejected += 1
    }
    await plateDb.outbox.delete(command.seq!)
  }
  return { rejected }
}

const pendingIds = (commands: OutboxCommand[]) =>
  new Set(commands.flatMap((c) => (c.entity_id ? [c.entity_id] : [])))

/** Kitchens keep the server's order. */
const ordered = (kitchens: Kitchen[]) =>
  kitchens.map((kitchen, position) => ({ ...kitchen, position }))

export async function mergePull(pulled: PlatePull): Promise<void> {
  const tables = [
    plateDb.kitchens,
    plateDb.meals,
    plateDb.grocery_items,
    plateDb.ideas,
    plateDb.people,
    plateDb.invites,
    plateDb.meta,
    plateDb.outbox,
  ]
  await plateDb.transaction('rw', tables, async () => {
    // Anything changed on this phone since the request left wins until it's sent.
    const waiting = await plateDb.outbox.toArray()
    const pending = pendingIds(waiting)
    const settingsWaiting = waiting.some((c) => c.entity === 'settings')

    await plateDb.setMeta('me', pulled.me)
    await plateDb.setMeta('meals_from', pulled.meals_from)
    if (!settingsWaiting) await plateDb.setMeta('settings', pulled.settings)

    const kitchens = ordered(pulled.kitchens).map((k) =>
      pending.has(k.id) ? { ...k, has_new_activity: false } : k,
    )
    await plateDb.kitchens.clear()
    await plateDb.kitchens.bulkPut(kitchens)
    await plateDb.people.clear()
    await plateDb.people.bulkPut(pulled.people)
    await plateDb.invites.clear()
    await plateDb.invites.bulkPut(pulled.invites)

    const mine = new Set(pulled.kitchens.map((k) => k.id))
    const whole = new Set(pulled.full_kitchens)
    for (const [table, rows, deleted] of [
      [plateDb.meals, pulled.meals, pulled.deleted.meals],
      [plateDb.grocery_items, pulled.grocery_items, pulled.deleted.grocery_items],
      [plateDb.ideas, pulled.ideas, pulled.deleted.ideas],
    ] as const) {
      // Kitchens I left are dropped; kitchens sent whole replace what's here.
      await table
        .filter(
          (row) => !mine.has(row.group_id) || (whole.has(row.group_id) && !pending.has(row.id)),
        )
        .delete()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (table as any).bulkPut(rows.filter((row) => !pending.has(row.id)))
      await table.bulkDelete(deleted.filter((id) => !pending.has(id)))
    }

    await plateDb.setMeta('cursor', pulled.server_time)
    await plateDb.setMeta('last_synced_at', new Date().toISOString())
  })
}

/** One cycle: send waiting changes, then pull. A refused change forces a full refresh. */
export async function runPlateSync(): Promise<PlateSyncResult> {
  const result = await flushOutbox()
  const cursor = result.rejected ? undefined : await plateDb.getMeta('cursor')
  await mergePull(await remote.pull(cursor))
  return result
}

export const countPlatePending = () => plateDb.outbox.count()

export const plateLastSynced = async () => (await plateDb.getMeta('last_synced_at')) ?? null

/** Past weeks aren't kept on the phone; load one from the server when it's opened. */
export async function loadPastMeals(from: string, to: string): Promise<void> {
  const keptFrom = await plateDb.getMeta('meals_from')
  if (!keptFrom || from >= keptFrom || !navigator.onLine) return
  const meals = await remote.listMeals(from, to < keptFrom ? to : keptFrom)
  await plateDb.transaction('rw', plateDb.meals, plateDb.outbox, async () => {
    const pending = pendingIds(await plateDb.outbox.toArray())
    await plateDb.meals.bulkPut(meals.filter((meal) => !pending.has(meal.id)))
  })
}
