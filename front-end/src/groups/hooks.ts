import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useLiveQuery } from 'dexie-react-hooks'
import { useAuth } from '@/auth/AuthContext'
import { api } from '@/auth/api'
import { db } from '@/db/db'
import type { Balances, GroupTx, Member } from './types'

const useToken = () => useAuth().token ?? ''

export function useApi<T>(key: unknown[], path: string, enabled = true) {
  const token = useToken()
  return useQuery({
    queryKey: key,
    queryFn: () => api<T>(path, token),
    enabled: !!token && enabled,
  })
}

export const useGroups = () =>
  useLiveQuery(() => db.groups.where('membership_status').equals('active').toArray(), [])
export const useInvitations = () =>
  useLiveQuery(() => db.groups.where('membership_status').equals('invited').toArray(), [])
export const useMembers = (id: string) =>
  useApi<Member[]>(['members', id], `/money/groups/${id}/members`)
export const useBalances = (id: string) =>
  useApi<Balances>(['balances', id], `/money/groups/${id}/balances`)
export const useGroupTxs = (id: string) =>
  useApi<GroupTx[]>(['gtx', id], `/money/transactions?group_id=${id}`)
export const useMe = () => useApi<{ id: string; email: string }>(['me'], '/auth/me')

/** POST/DELETE helper that invalidates the given query keys on success. */
export function useAction<TBody, TOut = unknown>(
  path: string | ((b: TBody) => string),
  invalidate: unknown[][],
  method = 'POST',
) {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: TBody) =>
      api<TOut>(typeof path === 'function' ? path(body) : path, token, {
        method,
        body: method === 'DELETE' ? undefined : JSON.stringify(body),
      }),
    onSuccess: () => invalidate.forEach((k) => qc.invalidateQueries({ queryKey: k })),
  })
}
