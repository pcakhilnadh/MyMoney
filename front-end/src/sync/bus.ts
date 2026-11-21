// Tiny pub/sub so repositories can ask for a sync without importing the sync engine.

/** Each app keeps its own local database and syncs on its own. */
export type SyncDomain = 'money' | 'food' | 'plate'

const listeners = new Set<(domain?: SyncDomain) => void>()

export const onSyncRequested = (fn: (domain?: SyncDomain) => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Ask for a background sync of one app, or of every app when `domain` is left out. */
export const requestSync = (domain?: SyncDomain) => listeners.forEach((fn) => fn(domain))
