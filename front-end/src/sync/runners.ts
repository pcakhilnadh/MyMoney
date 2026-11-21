/** The apps that sync, each on its own. SyncProvider runs whichever the user can open. */
import { countPlatePending, plateLastSynced, runPlateSync } from '@/plate/sync'
import type { SyncDomain } from './bus'
import { countPending, foodSync, moneySync, runSync, waitForSync } from './engine'

export interface SyncRunner {
  name: SyncDomain
  label: string
  /** Resolves with how many changes the server refused (they were undone locally). */
  run: (token: string, sub: string) => Promise<number>
  countPending: () => Promise<number>
  lastSyncedAt: (sub: string) => Promise<string | null>
}

const platePending = new Set<Promise<unknown>>()

export const RUNNERS: SyncRunner[] = [
  {
    name: 'money',
    label: 'My Money',
    run: async (token, sub) => {
      await runSync(moneySync, token, sub)
      return 0
    },
    countPending: () => countPending(moneySync),
    lastSyncedAt: async (sub) => localStorage.getItem(moneySync.lastKey(sub)),
  },
  {
    name: 'food',
    label: 'My Food',
    run: async (token, sub) => {
      await runSync(foodSync, token, sub)
      return 0
    },
    countPending: () => countPending(foodSync),
    lastSyncedAt: async (sub) => localStorage.getItem(foodSync.lastKey(sub)),
  },
  {
    name: 'plate',
    label: 'MyPlate',
    run: async () => {
      const sync = runPlateSync()
      platePending.add(sync)
      try {
        return (await sync).rejected
      } finally {
        platePending.delete(sync)
      }
    },
    countPending: countPlatePending,
    lastSyncedAt: plateLastSynced,
  },
]

/** Resolves once every app has finished syncing (before signing out). */
export async function waitForAllSyncs(sub: string): Promise<void> {
  await Promise.allSettled([waitForSync(sub), ...platePending])
}
