import { api, ApiError } from '@/auth/api'
import { db } from '@/db/db'
import type { Syncable } from '@/db/types'

type EntityName = 'categories' | 'accounts' | 'merchants' | 'transactions' | 'budgets'
const ENTITIES: EntityName[] = ['categories', 'accounts', 'merchants', 'transactions', 'budgets']

/** Fields the server may omit, used when a record is first pulled. */
const DEFAULTS: Record<EntityName, object> = {
  categories: { is_system: false, is_hidden: false },
  accounts: {},
  merchants: {},
  transactions: {
    group_id: null,
    context: 'personal',
    is_shared: false,
    split_method: null,
    long_description: null,
  },
  budgets: { group_id: null },
}

interface PullResponse extends Record<EntityName, (Syncable & { id: string })[]> {
  server_time: string
}
interface PushResponse {
  accepted: { entity: EntityName; id: string; canonical_id?: string }[]
  conflicts: { entity: EntityName; id: string }[]
}

const cursorKey = (sub: string) => `exptracker.sync.cursor.${sub}`
export const lastSyncKey = (sub: string) => `exptracker.sync.last.${sub}`

// Dexie tables are generic over their record type; the engine treats them uniformly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (name: EntityName) => db[name] as any

export async function countPending(): Promise<number> {
  let n = 0
  for (const e of ENTITIES) n += await table(e).where('sync_state').notEqual('synced').count()
  return n
}

/** One full cycle: register profile, push local changes, pull server changes. */
export async function runSync(token: string, sub: string): Promise<void> {
  await api('/auth/me', token) // creates the profile row on first sign-in

  // ---- push ----
  const payload: Record<string, Syncable[]> = {}
  const sent = new Map<string, number>() // `${entity}:${id}` -> version sent
  for (const e of ENTITIES) {
    const rows: Syncable[] = await table(e).where('sync_state').notEqual('synced').toArray()
    payload[e] = rows
    rows.forEach((r) => sent.set(`${e}:${r.id}`, r.version))
  }
  let conflicts = new Set<string>()
  let merchantMerged = false
  if (sent.size > 0) {
    try {
      const res = await api<PushResponse>('/sync/push', token, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      conflicts = new Set(res.conflicts.map((c) => c.id))
      for (const { entity, id, canonical_id } of res.accepted) {
        if (entity === 'merchants' && canonical_id && canonical_id !== id) {
          await table(entity).delete(id)
          merchantMerged = true
          continue
        }
        // Only mark synced if the record was not edited again while the request was in flight.
        const row: Syncable | undefined = await table(entity).get(id)
        if (row && row.version === sent.get(`${entity}:${id}`)) {
          await table(entity).update(id, { sync_state: 'synced' })
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        for (const e of ENTITIES)
          for (const r of payload[e]) await table(e).update(r.id, { sync_state: 'failed' })
      }
      throw err
    }
  }

  // ---- pull ----
  const since = localStorage.getItem(cursorKey(sub))
  const qs =
    since && conflicts.size === 0 && !merchantMerged ? `?since=${encodeURIComponent(since)}` : ''
  const pulled = await api<PullResponse>('/sync/pull' + qs, token)
  for (const e of ENTITIES) {
    for (const remote of pulled[e]) {
      const local: Syncable | undefined = await table(e).get(remote.id)
      const serverWins =
        !local ||
        local.sync_state === 'synced' ||
        conflicts.has(remote.id) ||
        local.version < remote.version
      if (serverWins) {
        await table(e).put({ ...DEFAULTS[e], ...local, ...remote, sync_state: 'synced' })
      }
    }
  }
  localStorage.setItem(cursorKey(sub), pulled.server_time)
  localStorage.setItem(lastSyncKey(sub), new Date().toISOString())
}
