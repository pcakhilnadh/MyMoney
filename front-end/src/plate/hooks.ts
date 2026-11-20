import { useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/auth/AuthContext'
import * as api from './api'
import { ME } from './mockData'
import type { Kitchen, PlateUser, UserId } from './types'

const KEY = ['plate'] as const

export const useKitchens = () =>
  useQuery({ queryKey: [...KEY, 'kitchens'], queryFn: api.listKitchens })
export const useSettings = () =>
  useQuery({ queryKey: [...KEY, 'settings'], queryFn: api.getSettings })
export const useInvites = () =>
  useQuery({ queryKey: [...KEY, 'invites'], queryFn: api.listInvites })
export const useContacts = () =>
  useQuery({ queryKey: [...KEY, 'contacts'], queryFn: api.listContacts })
export const useMeals = (from: string, to: string) =>
  useQuery({ queryKey: [...KEY, 'meals', from, to], queryFn: () => api.listMeals(from, to) })
export const useGroceries = () =>
  useQuery({ queryKey: [...KEY, 'groceries'], queryFn: api.listGroceries })
export const useIdeas = () => useQuery({ queryKey: [...KEY, 'ideas'], queryFn: api.listIdeas })

/**
 * Every write refreshes all MyPlate queries. The mock answers instantly; with the real
 * backend this is where optimistic updates per query would go.
 */
export function usePlateMutation<TArgs, TResult>(fn: (args: TArgs) => Promise<TResult>) {
  const client = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSettled: () => client.invalidateQueries({ queryKey: KEY }),
  })
}

export const useMe = (): UserId => ME

/** People lookup. The current user's name and picture come from the host app's profile. */
export function usePeople() {
  const { user } = useAuth()
  const people = useQuery({ queryKey: [...KEY, 'people'], queryFn: api.listPeople })
  return useMemo(() => {
    const index = new Map<UserId, PlateUser>()
    for (const person of people.data ?? []) index.set(person.id, person)
    index.set(ME, { id: ME, name: user?.name ?? 'You', avatar: user?.picture })
    const personOf = (id: UserId): PlateUser => index.get(id) ?? { id, name: 'Someone' }
    /** "You" for the current user, the first name for everyone else. */
    const nameOf = (id: UserId) => (id === ME ? 'You' : personOf(id).name.split(' ')[0])
    return { personOf, nameOf }
  }, [people.data, user?.name, user?.picture])
}

export function kitchenById(kitchens: readonly Kitchen[] | undefined, id: string) {
  return kitchens?.find((kitchen) => kitchen.id === id)
}

/** Shared kitchens where I'm live as shopping right now. */
export function useMyShopping(): Kitchen[] {
  const me = useMe()
  return (useKitchens().data ?? []).filter((k) => !k.is_personal && k.shopping_now.includes(me))
}
