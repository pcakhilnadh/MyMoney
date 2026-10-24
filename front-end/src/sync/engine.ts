import { api, ApiError } from '@/auth/api'
import { db } from '@/db/db'
import type { Budget, Category, GroupCache, Syncable } from '@/db/types'
import { migrateLegacyFoodStorage } from '@/lib/food'

type EntityName =
  | 'categories'
  | 'accounts'
  | 'merchants'
  | 'transactions'
  | 'budgets'
  | 'due_payments'
  | 'food_entries'
  | 'food_library'
  | 'habits'
  | 'habit_logs'
const ENTITIES: EntityName[] = [
  'categories',
  'accounts',
  'merchants',
  'transactions',
  'budgets',
  'due_payments',
  'food_entries',
  'food_library',
  'habits',
  'habit_logs',
]

/** Fields the server may omit, used when a record is first pulled. */
const DEFAULTS: Record<EntityName, object> = {
  categories: { is_system: false, is_hidden: false },
  accounts: { payment_due_day: null },
  due_payments: {},
  food_entries: {},
  food_library: {},
  habits: { description: null, frequency: 'daily', target_per_week: 7 },
  habit_logs: { note: null, completed: true },
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
  groups: Omit<GroupCache, 'membership_status'>[]
  invitations: Omit<GroupCache, 'membership_status'>[]
}
interface PushResponse {
  accepted: { entity: EntityName; id: string; canonical_id?: string }[]
  conflicts: { entity: EntityName; id: string }[]
}

const cursorKey = (sub: string) => `exptracker.sync.cursor.${sub}`
export const lastSyncKey = (sub: string) => `exptracker.sync.last.${sub}`

const activeSyncs = new Map<string, Promise<void>>()

async function pullAndMerge(
  token: string,
  since?: string,
  conflicts = new Set<string>(),
): Promise<PullResponse> {
  const qs = since && conflicts.size === 0 ? `?since=${encodeURIComponent(since)}` : ''
  const pulled = await api<PullResponse>('/sync/pull' + qs, token)
  for (const e of ENTITIES) {
    for (const remote of pulled[e] ?? []) {
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
  const groupSnapshots: GroupCache[] = [
    ...(pulled.groups ?? []).map((group) => ({ ...group, membership_status: 'active' as const })),
    ...(pulled.invitations ?? []).map((group) => ({
      ...group,
      membership_status: 'invited' as const,
    })),
  ]
  await db.transaction('rw', db.groups, async () => {
    await db.groups.clear()
    await db.groups.bulkPut(groupSnapshots)
  })
  return pulled
}

async function mergeCategoryId(id: string, canonicalId: string): Promise<void> {
  await db.transaction('rw', db.categories, db.transactions, db.budgets, async () => {
    await db.transactions.where('category_id').equals(id).modify({ category_id: canonicalId })
    await db.budgets.where('category_id').equals(id).modify({ category_id: canonicalId })
    await db.categories.delete(id)
  })
}

export function clearSyncState(sub: string): void {
  localStorage.removeItem(cursorKey(sub))
  localStorage.removeItem(lastSyncKey(sub))
}

export async function waitForSync(sub: string): Promise<void> {
  await activeSyncs.get(sub)
}

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
  const sync = syncCycle(token, sub)
  activeSyncs.set(sub, sync)
  try {
    await sync
  } finally {
    if (activeSyncs.get(sub) === sync) activeSyncs.delete(sub)
  }
}

async function syncCycle(token: string, sub: string): Promise<void> {
  await migrateLegacyFoodStorage()
  await api('/auth/me', token) // creates the profile row on first sign-in

  const since = localStorage.getItem(cursorKey(sub))
  let pullSince = since ?? undefined
  if (!since) {
    const initial = await pullAndMerge(token)
    pullSince = initial.server_time
  }

  // ---- push ----
  const payload: Record<string, Syncable[]> = {}
  const sent = new Map<string, number>() // `${entity}:${id}` -> version sent
  for (const e of ENTITIES) {
    const rows: Syncable[] = await table(e).where('sync_state').notEqual('synced').toArray()
    payload[e] = rows
    rows.forEach((r) => sent.set(`${e}:${r.id}`, r.version))
  }
  const pendingCategoryIds = new Set(payload.categories.map((category) => category.id))
  const budgetCategoryIds = [
    ...new Set(
      (payload.budgets as Budget[])
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
  let conflicts = new Set<string>()
  let merchantMerged = false
  let categoryMerged = false
  if (sent.size > 0) {
    try {
      const res = await api<PushResponse>('/sync/push', token, {
        method: 'POST',
        body: JSON.stringify(payload),
      })
      conflicts = new Set(res.conflicts.map((c) => c.id))
      for (const { entity, id, canonical_id } of res.accepted) {
        if (entity === 'categories' && canonical_id && canonical_id !== id) {
          await mergeCategoryId(id, canonical_id)
          categoryMerged = true
          continue
        }
        if (
          (entity === 'merchants' || entity === 'food_library') &&
          canonical_id &&
          canonical_id !== id
        ) {
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
  const pulled = await pullAndMerge(
    token,
    merchantMerged || categoryMerged ? undefined : pullSince,
    conflicts,
  )
  localStorage.setItem(cursorKey(sub), pulled.server_time)
  localStorage.setItem(lastSyncKey(sub), new Date().toISOString())
}
