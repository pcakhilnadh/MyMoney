import { useEffect, useMemo } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { requestSync } from '@/sync/bus'
import { plateDb } from './store'
import { loadPastMeals } from './sync'
import type { Kitchen, PlateUser, UserId } from './types'

/*
 * Screens read MyPlate from the local database, so it opens instantly, offline too, and
 * updates as soon as a change is saved or synced. `data` is undefined until the first
 * sync has run on this phone.
 */

const useLocal = <T>(query: () => Promise<T>, deps: unknown[] = []) => ({
  data: useLiveQuery(query, deps),
})

/** Lists are only meaningful once this phone has synced MyPlate once. */
async function ifSynced<T>(read: () => Promise<T>): Promise<T | undefined> {
  return (await plateDb.getMeta('cursor')) ? read() : undefined
}

const byCreated = <T extends { created_at?: string }>(rows: T[]) =>
  rows.sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))

export const useMeQuery = () => useLocal(() => plateDb.getMeta('me'))

export const useKitchens = () =>
  useLocal(() =>
    ifSynced(async () =>
      (await plateDb.kitchens.toArray()).sort((a, b) => (a.position ?? 0) - (b.position ?? 0)),
    ),
  )

export const useSettings = () => useLocal(() => plateDb.getMeta('settings'))

export const useInvites = () => useLocal(() => ifSynced(() => plateDb.invites.toArray()))

export const useContacts = () =>
  useLocal(async () => {
    const ids = await plateDb.getMeta('contact_ids')
    if (!ids) return undefined
    const people = await plateDb.people.bulkGet(ids)
    return people
      .filter((person): person is PlateUser => !!person)
      .sort((a, b) => a.name.localeCompare(b.name))
  })

export function useMeals(from: string, to: string) {
  // Past weeks beyond what the phone keeps come from the server when opened.
  useEffect(() => {
    loadPastMeals(from, to).catch((error: unknown) =>
      console.error('Unable to load past meals', error),
    )
  }, [from, to])
  return useLocal(
    () =>
      ifSynced(async () =>
        byCreated(await plateDb.meals.where('meal_date').between(from, to, true, true).toArray()),
      ),
    [from, to],
  )
}

export const useGroceries = () =>
  useLocal(() => ifSynced(async () => byCreated(await plateDb.grocery_items.toArray())))

export const useIdeas = () =>
  useLocal(() => ifSynced(async () => byCreated(await plateDb.ideas.toArray())))

/**
 * Runs a MyPlate change. Everyday changes save locally, so they never wait for the network
 * (`networkMode: 'always'` keeps React Query from pausing them offline).
 */
export function usePlateMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  return useMutation({ mutationFn: fn, networkMode: 'always' })
}

/** My user id ('' until it has loaded). */
export const useMe = (): UserId => useMeQuery().data?.id ?? ''

/** People lookup: first names and pictures from the last sync. */
export function usePeople() {
  const me = useMe()
  const people = useLiveQuery(() => plateDb.people.toArray(), [])
  return useMemo(() => {
    const index = new Map<UserId, PlateUser>()
    for (const person of people ?? []) index.set(person.id, person)
    const personOf = (id: UserId): PlateUser => index.get(id) ?? { id, name: 'Someone' }
    /** "You" for the current user, the first name for everyone else. */
    const nameOf = (id: UserId) => (id === me ? 'You' : personOf(id).name.split(' ')[0])
    return { personOf, nameOf }
  }, [people, me])
}

/** Shared kitchens where I'm live as shopping right now. */
export function useMyShopping(): Kitchen[] {
  const me = useMe()
  return (useKitchens().data ?? []).filter(
    (k) => !k.is_personal && !!me && k.shopping_now.includes(me),
  )
}

// ─── Background refresh ──────────────────────────────────────────────────────────────────

/** Everyone: other members' changes arrive on open, on return, after my changes, and every minute. */
const BASIC_REFRESH = 60_000
/** Live layer: ticks, cart and "shopping now" from others within seconds. */
const LIVE_REFRESH = 15_000

/**
 * Whether this user gets the live layer. Everyone does for now.
 * TODO(plan-tier): gate on a `plate_live` entitlement when plans are introduced.
 */
export const hasLiveLayer = () => true

/** While MyPlate is open: sync now, then keep refreshing while the app is visible. */
export function usePlateAutoSync() {
  const shared = (useKitchens().data ?? []).some((k) => !k.is_personal)
  const every = shared && hasLiveLayer() ? LIVE_REFRESH : BASIC_REFRESH
  useEffect(() => {
    requestSync('plate')
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') requestSync('plate')
    }, every)
    return () => clearInterval(timer)
  }, [every])
}
