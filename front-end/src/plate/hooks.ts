import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import * as api from './api'
import type { Kitchen, PlateUser, UserId } from './types'

const KEY = ['plate'] as const

/*
 * Other members' changes (ticks, cart, "shopping now") arrive by polling while MyPlate is
 * open, and on refocus. The fast lists are the ones people watch together.
 */
const LIVE = 15_000
const STEADY = 60_000

export const useMeQuery = () =>
  useQuery({ queryKey: [...KEY, 'me'], queryFn: api.getMe, staleTime: 5 * 60_000 })
export const useKitchens = () =>
  useQuery({ queryKey: [...KEY, 'kitchens'], queryFn: api.listKitchens, refetchInterval: LIVE })
export const useSettings = () =>
  useQuery({ queryKey: [...KEY, 'settings'], queryFn: api.getSettings })
export const useInvites = () =>
  useQuery({ queryKey: [...KEY, 'invites'], queryFn: api.listInvites, refetchInterval: STEADY })
export const useContacts = () =>
  useQuery({ queryKey: [...KEY, 'contacts'], queryFn: api.listContacts })
export const useMeals = (from: string, to: string) =>
  useQuery({
    queryKey: [...KEY, 'meals', from, to],
    queryFn: () => api.listMeals(from, to),
    refetchInterval: LIVE,
  })
export const useGroceries = () =>
  useQuery({ queryKey: [...KEY, 'groceries'], queryFn: api.listGroceries, refetchInterval: LIVE })
export const useIdeas = () =>
  useQuery({ queryKey: [...KEY, 'ideas'], queryFn: api.listIdeas, refetchInterval: STEADY })

/** Every write refreshes the MyPlate queries, so all screens agree with the server. */
export function usePlateMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => client.invalidateQueries({ queryKey: KEY }),
  })
}

/** My user id ('' until it has loaded). */
export const useMe = (): UserId => useMeQuery().data?.id ?? ''

/** People lookup: first names and pictures from the server. */
export function usePeople() {
  const me = useMe()
  const people = useQuery({ queryKey: [...KEY, 'people'], queryFn: api.listPeople })
  return useMemo(() => {
    const index = new Map<UserId, PlateUser>()
    for (const person of people.data ?? []) index.set(person.id, person)
    const personOf = (id: UserId): PlateUser => index.get(id) ?? { id, name: 'Someone' }
    /** "You" for the current user, the first name for everyone else. */
    const nameOf = (id: UserId) => (id === me ? 'You' : personOf(id).name.split(' ')[0])
    return { personOf, nameOf }
  }, [people.data, me])
}

/** Shared kitchens where I'm live as shopping right now. */
export function useMyShopping(): Kitchen[] {
  const me = useMe()
  return (useKitchens().data ?? []).filter(
    (k) => !k.is_personal && !!me && k.shopping_now.includes(me),
  )
}
