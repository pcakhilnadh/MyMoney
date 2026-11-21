/**
 * Record sync for the local-first apps. Each app (`RecordDomain`) has its own local
 * database, its own /sync/<app>/push and /pull endpoints and its own cursor, so a backlog
 * or failure in one never holds up another. MyPlate syncs differently (see plate/sync.ts).
 */
import type Dexie from 'dexie'
import { api, ApiError } from '@/auth/api'
import { db } from '@/db/db'
import type { Budget, Category, GroupCache, Syncable } from '@/db/types'
import { foodDb, foodReady } from '@/food/db'

type Row = Syncable & { id: string }
type Payload = Record<string, Row[]>
type Pulled = Record<string, unknown> & { server_time: string }

interface PushResponse {
  accepted: { entity: string; id: string; canonical_id?: string }[]
  conflicts: { entity: string; id: string }[]
}

export interface RecordDomain {
  name: 'money' | 'food'
  db: Dexie
  /** Pushed in this order (parents first). */
  entities: readonly string[]
  /** Fields the server may omit, used when a record is first pulled. */
  defaults: Record<string, object>
  cursorKey: (sub: string) => string
  lastKey: (sub: string) => string
  /** Waited for before each cycle (e.g. a one-time local data move). */
  ready?: Promise<unknown>
  /** Runs before the first push (e.g. registering the profile). */
  beforeCycle?: (token: string) => Promise<unknown>
  /** Adds records the server needs alongside the pending ones. */
  extendPush?: (payload: Payload, sent: Map<string, number>) => Promise<void>
  /** The server kept another record instead; true when local rows were merged into it. */
  adoptCanonical?: (entity: string, id: string, canonicalId: string) => Promise<boolean>
  /** Snapshots that come with every pull. */
  afterPull?: (pulled: Pulled) => Promise<void>
}

// ─── My Money ────────────────────────────────────────────────────────────────────────────

async function mergeCategoryId(id: string, canonicalId: string): Promise<void> {
  await db.transaction('rw', db.categories, db.transactions, db.budgets, async () => {
    await db.transactions.where('category_id').equals(id).modify({ category_id: canonicalId })
    await db.budgets.where('category_id').equals(id).modify({ category_id: canonicalId })
    await db.categories.delete(id)
  })
}

export const moneySync: RecordDomain = {
  name: 'money',
  db,
  entities: ['categories', 'accounts', 'merchants', 'transactions', 'budgets', 'due_payments'],
  defaults: {
    categories: { is_system: false, is_hidden: false },
    accounts: { payment_due_day: null },
    transactions: {
      group_id: null,
      context: 'personal',
      is_shared: false,
      split_method: null,
      long_description: null,
    },
    budgets: { group_id: null },
  },
  // My Money keeps the cursor it had when it synced every app, so nobody re-downloads it.
  cursorKey: (sub) => `exptracker.sync.cursor.${sub}`,
  lastKey: (sub) => `exptracker.sync.last.${sub}`,
  beforeCycle: (token) => api('/auth/me', token), // creates the profile row on first sign-in
  async extendPush(payload, sent) {
    // A budget's category must reach the server with it, even when already synced.
    const pendingCategoryIds = new Set(payload.categories.map((category) => category.id))
    const budgetCategoryIds = [
      ...new Set(
        (payload.budgets as unknown as Budget[])
          .map((budget) => budget.category_id)
          .filter((id): id is string => id !== null),
      ),
    ]
    for (const category of (await db.categories.bulkGet(budgetCategoryIds)).filter(
      (category): category is Category => category !== undefined,
    )) {
      if (!pendingCategoryIds.has(category.id)) {
        payload.categories.push(category)
        sent.set(`categories:${category.id}`, category.version)
      }
    }
  },
  async adoptCanonical(entity, id, canonicalId) {
    if (entity === 'categories') {
      await mergeCategoryId(id, canonicalId)
      return true
    }
    if (entity === 'merchants') {
      await db.merchants.delete(id)
      return true
    }
    return false
  },
  async afterPull(pulled) {
    const groups = (pulled.groups ?? []) as Omit<GroupCache, 'membership_status'>[]
    const invitations = (pulled.invitations ?? []) as Omit<GroupCache, 'membership_status'>[]
    const snapshots: GroupCache[] = [
      ...groups.map((group) => ({ ...group, membership_status: 'active' as const })),
      ...invitations.map((group) => ({ ...group, membership_status: 'invited' as const })),
    ]
    await db.transaction('rw', db.groups, async () => {
      await db.groups.clear()
      await db.groups.bulkPut(snapshots)
    })
  },
}

// ─── My Food ─────────────────────────────────────────────────────────────────────────────

export const foodSync: RecordDomain = {
  name: 'food',
  db: foodDb,
  entities: ['meal_logs'],
  defaults: {
    meal_logs: {
      image: null,
      calories_100g: null,
      protein_100g: null,
      carbs_100g: null,
      fat_100g: null,
    },
  },
  cursorKey: (sub) => `exptracker.sync.food.cursor.${sub}`,
  lastKey: (sub) => `exptracker.sync.food.last.${sub}`,
  ready: foodReady,
}

export const RECORD_DOMAINS = [moneySync, foodSync] as const

// ─── Engine ──────────────────────────────────────────────────────────────────────────────

// Dexie tables are generic over their record type; the engine treats them uniformly.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (domain: RecordDomain, name: string) => domain.db.table(name) as any

async function pullAndMerge(
  domain: RecordDomain,
  token: string,
  since?: string,
  conflicts = new Set<string>(),
): Promise<Pulled> {
  const qs = since && conflicts.size === 0 ? `?since=${encodeURIComponent(since)}` : ''
  const pulled = await api<Pulled>(`/sync/${domain.name}/pull${qs}`, token)
  for (const e of domain.entities) {
    for (const remote of (pulled[e] ?? []) as Row[]) {
      const local: Syncable | undefined = await table(domain, e).get(remote.id)
      const serverWins =
        !local ||
        local.sync_state === 'synced' ||
        conflicts.has(remote.id) ||
        local.version < remote.version
      if (serverWins) {
        await table(domain, e).put({
          ...domain.defaults[e],
          ...local,
          ...remote,
          sync_state: 'synced',
        })
      }
    }
  }
  await domain.afterPull?.(pulled)
  return pulled
}

const activeSyncs = new Map<string, Promise<void>>()

/** Forget every app's cursor, so the next sign-in starts fresh. */
export function clearSyncState(sub: string): void {
  for (const domain of RECORD_DOMAINS) {
    localStorage.removeItem(domain.cursorKey(sub))
    localStorage.removeItem(domain.lastKey(sub))
  }
}

/** Resolves once every sync running for this user has finished. */
export async function waitForSync(sub: string): Promise<void> {
  await Promise.all(
    [...activeSyncs].filter(([key]) => key.endsWith(`:${sub}`)).map(([, sync]) => sync),
  )
}

export async function countPending(domain: RecordDomain): Promise<number> {
  await domain.ready
  let n = 0
  for (const e of domain.entities)
    n += await table(domain, e).where('sync_state').notEqual('synced').count()
  return n
}

/** One full cycle for one app: push local changes, then pull server changes. */
export async function runSync(domain: RecordDomain, token: string, sub: string): Promise<void> {
  const key = `${domain.name}:${sub}`
  const sync = syncCycle(domain, token, sub)
  activeSyncs.set(key, sync)
  try {
    await sync
  } finally {
    if (activeSyncs.get(key) === sync) activeSyncs.delete(key)
  }
}

async function syncCycle(domain: RecordDomain, token: string, sub: string): Promise<void> {
  await domain.ready
  await domain.beforeCycle?.(token)

  const since = localStorage.getItem(domain.cursorKey(sub))
  let pullSince = since ?? undefined
  if (!since) {
    const initial = await pullAndMerge(domain, token)
    pullSince = initial.server_time
  }

  // ---- push ----
  const payload: Payload = {}
  const sent = new Map<string, number>() // `${entity}:${id}` -> version sent
  for (const e of domain.entities) {
    const rows: Row[] = await table(domain, e).where('sync_state').notEqual('synced').toArray()
    payload[e] = rows
    rows.forEach((r) => sent.set(`${e}:${r.id}`, r.version))
  }
  await domain.extendPush?.(payload, sent)
  let conflicts = new Set<string>()
  let merged = false
  if (sent.size > 0) {
    try {
      const res = await api<PushResponse>(`/sync/${domain.name}/push`, token, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      conflicts = new Set(res.conflicts.map((c) => c.id))
      for (const { entity, id, canonical_id } of res.accepted) {
        if (canonical_id && canonical_id !== id && domain.adoptCanonical) {
          if (await domain.adoptCanonical(entity, id, canonical_id)) {
            merged = true
            continue
          }
        }
        // Only mark synced if the record was not edited again while the request was in flight.
        const row: Syncable | undefined = await table(domain, entity).get(id)
        if (row && row.version === sent.get(`${entity}:${id}`)) {
          await table(domain, entity).update(id, { sync_state: 'synced' })
        }
      }
    } catch (err) {
      if (err instanceof ApiError && err.status >= 400 && err.status < 500) {
        for (const e of domain.entities)
          for (const r of payload[e]) await table(domain, e).update(r.id, { sync_state: 'failed' })
      }
      throw err
    }
  }

  // ---- pull ----
  const pulled = await pullAndMerge(domain, token, merged ? undefined : pullSince, conflicts)
  localStorage.setItem(domain.cursorKey(sub), pulled.server_time)
  localStorage.setItem(domain.lastKey(sub), new Date().toISOString())
}
