/*
 * Where you came from, per browser tab.
 *
 * - The trail: the in-app address at each step of this tab's history, so a back button
 *   knows what "back" is (and can name it) before it's pressed.
 * - Spots: for each screen you left, how far down it was and which row, card or link you
 *   tapped, so coming back lands on that same item.
 *
 * Kept in sessionStorage, so it survives a reload but not a new tab.
 */

export interface Spot {
  path: string
  /** Page scroll when you left. */
  y: number
  /** The `data-return-id` of the row or card you tapped. */
  anchor?: string
  /** Or the link you tapped, when it had no `data-return-id`. */
  href?: string
  /** How far from the top of the screen that item was, to put it back in the same place. */
  top?: number
}

const TRAIL_KEY = 'nav.trail'
const SPOTS_KEY = 'nav.spots'
const MAX_SPOTS = 60

function read<T>(key: string, fallback: T): T {
  try {
    const raw = sessionStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function write(key: string, value: unknown) {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Without storage, back buttons fall back to their default screen.
  }
}

/** This entry's position in the tab's history (React Router keeps it in history.state). */
export function historyIndex(): number {
  const state = window.history.state as { idx?: unknown } | null
  return typeof state?.idx === 'number' ? state.idx : 0
}

/** Note the current address in the trail. A new step drops anything that was ahead of it. */
export function rememberEntry(path: string, isNewStep: boolean) {
  const idx = historyIndex()
  const trail = read<string[]>(TRAIL_KEY, [])
  trail[idx] = path
  if (isNewStep) trail.length = idx + 1
  write(TRAIL_KEY, trail)
}

/** The in-app address one step back in this tab, or null when this is where the tab started. */
export function previousPath(): string | null {
  const idx = historyIndex()
  if (idx < 1) return null
  return read<(string | null)[]>(TRAIL_KEY, [])[idx - 1] ?? null
}

export function saveSpot(key: string, spot: Spot) {
  const spots = read<Record<string, Spot>>(SPOTS_KEY, {})
  delete spots[key]
  spots[key] = spot
  const keys = Object.keys(spots)
  for (const old of keys.slice(0, Math.max(0, keys.length - MAX_SPOTS))) delete spots[old]
  write(SPOTS_KEY, spots)
}

/** The spot saved for this history entry, or else the latest one saved for the same address. */
export function spotFor(key: string, path: string): Spot | null {
  const spots = read<Record<string, Spot>>(SPOTS_KEY, {})
  if (spots[key]?.path === path) return spots[key]
  const same = Object.values(spots).filter((spot) => spot.path === path)
  return same.at(-1) ?? null
}
