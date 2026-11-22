import { useEffect, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { useMe } from '@/groups/hooks'
import type { AppRole, Feature } from './membership'

interface CachedAccess {
  role: AppRole
  entitlements: Feature[]
}

const cacheKey = (sub: string) => `mytracker.access.${sub}`

function readCache(sub: string | undefined): CachedAccess | null {
  if (!sub) return null
  try {
    const raw = localStorage.getItem(cacheKey(sub))
    const parsed = raw ? (JSON.parse(raw) as CachedAccess) : null
    return parsed && Array.isArray(parsed.entitlements) ? parsed : null
  } catch {
    return null
  }
}

/**
 * What the signed-in user may open. The last answer from /auth/me is remembered per user so
 * the app keeps working offline; with nothing known, only My Money is assumed. The server
 * enforces the same rules.
 */
export function useEntitlements() {
  const { user } = useAuth()
  const me = useMe()
  const sub = user?.sub
  const fresh =
    me.data && Array.isArray(me.data.entitlements)
      ? { role: me.data.role, entitlements: me.data.entitlements }
      : null

  useEffect(() => {
    if (!sub || !fresh) return
    try {
      localStorage.setItem(cacheKey(sub), JSON.stringify(fresh))
    } catch {
      // Offline access simply falls back to the defaults.
    }
  }, [sub, fresh?.role, fresh?.entitlements.join(',')]) // eslint-disable-line react-hooks/exhaustive-deps

  const access = fresh ?? readCache(sub)
  // The request is not running at all when there is no token (e.g. offline); don't wait for it.
  const idle = me.fetchStatus === 'idle' && me.isPending
  const ready = !!access || me.isSuccess || me.isError || idle
  const list: Feature[] = access?.entitlements ?? ['money', 'plate']
  return {
    ready,
    role: access?.role,
    has: (feature: Feature) => list.includes(feature),
  }
}

/** Sends users without the feature back to My Money. */
export function RequireFeature({ feature, children }: { feature: Feature; children: ReactNode }) {
  const { ready, has } = useEntitlements()
  if (!ready) return null
  if (!has(feature)) return <Navigate to="/money/home" replace />
  return <>{children}</>
}

/** Owner-only pages. */
export function RequireOwner({ children }: { children: ReactNode }) {
  const { ready, role } = useEntitlements()
  if (!ready) return null
  if (role !== 'owner') return <Navigate to="/personal" replace />
  return <>{children}</>
}
