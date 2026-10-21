// Tiny pub/sub so repositories can ask for a sync without importing the sync engine.
const listeners = new Set<() => void>()

export const onSyncRequested = (fn: () => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export const requestSync = () => listeners.forEach((fn) => fn())
