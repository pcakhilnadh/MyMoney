import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { fetchAuthSessions, refreshSession, type AuthSession } from '@/auth/api'
import { useEntitlements } from '@/account/entitlements'
import { onSyncRequested, type SyncDomain } from './bus'
import { RUNNERS, type SyncRunner } from './runners'

const sessionStorageKey = (sub: string) => `exptracker.sessions.${sub}`

export function cachedAuthSessions(sub: string): AuthSession[] {
  const cached = localStorage.getItem(sessionStorageKey(sub))
  if (!cached) return []
  try {
    const sessions = JSON.parse(cached) as AuthSession[]
    if (!Array.isArray(sessions)) throw new Error('Invalid cached sessions')
    return sessions
  } catch (error) {
    localStorage.removeItem(sessionStorageKey(sub))
    console.error('Unable to read cached sessions', error)
    return []
  }
}

async function updateAuthSessions(token: string, sub: string): Promise<void> {
  const sessions = await fetchAuthSessions(token)
  localStorage.setItem(sessionStorageKey(sub), JSON.stringify(sessions))
}

export interface AppSyncStatus {
  state: 'idle' | 'syncing' | 'offline' | 'error'
  pending: number
  lastSyncedAt: string | null
  error: string | null
}

export interface SyncStatus extends AppSyncStatus {
  /** Each app's own sync, in app order, for the profile breakdown. */
  apps: (AppSyncStatus & { name: SyncDomain; label: string })[]
  /** Sync one app now, or every app when `app` is left out. */
  syncNow: (app?: SyncDomain) => Promise<void>
}

const IDLE: AppSyncStatus = { state: 'idle', pending: 0, lastSyncedAt: null, error: null }
const DEBOUNCE_MS = 1000

/** One status for the whole app: the worst state, every pending change, the oldest sync. */
function combine(apps: AppSyncStatus[]): AppSyncStatus {
  const has = (state: AppSyncStatus['state']) => apps.some((app) => app.state === state)
  const times = apps.map((app) => app.lastSyncedAt)
  return {
    state: has('error')
      ? 'error'
      : has('syncing')
        ? 'syncing'
        : has('offline')
          ? 'offline'
          : 'idle',
    pending: apps.reduce((sum, app) => sum + app.pending, 0),
    lastSyncedAt: times.includes(null) ? null : ([...times].sort()[0] ?? null),
    error: apps.find((app) => app.error)?.error ?? null,
  }
}

export function SyncProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth()
  const sub = user?.sub ?? null
  const { has } = useEntitlements()
  // My Money is always on; the others only sync for people who can open them.
  const enabledKey = RUNNERS.filter((r) => r.name === 'money' || has(r.name))
    .map((r) => r.name)
    .join(',')
  const runners = useMemo(
    () => RUNNERS.filter((runner) => enabledKey.split(',').includes(runner.name)),
    [enabledKey],
  )
  const [status, setStatus] = useState<Partial<Record<SyncDomain, AppSyncStatus>>>({})
  const running = useRef(new Set<SyncDomain>())
  const again = useRef(new Set<SyncDomain>())

  const patch = useCallback((name: SyncDomain, change: Partial<AppSyncStatus>) => {
    setStatus((current) => ({ ...current, [name]: { ...IDLE, ...current[name], ...change } }))
  }, [])

  const runOne = useCallback(
    async (runner: SyncRunner, accessToken: string): Promise<void> => {
      if (!sub) return
      const { name } = runner
      if (running.current.has(name)) {
        again.current.add(name)
        return
      }
      running.current.add(name)
      patch(name, { state: 'syncing', pending: await runner.countPending() })
      try {
        const rejected = await runner.run(accessToken, sub)
        patch(name, {
          state: rejected ? 'error' : 'idle',
          error: rejected
            ? `${runner.label}: ${rejected} change${rejected === 1 ? '' : 's'} couldn’t be saved and ${rejected === 1 ? 'was' : 'were'} undone.`
            : null,
        })
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Sync failed'
        patch(name, { state: 'error', error: `${runner.label}: ${message}` })
      } finally {
        running.current.delete(name)
        patch(name, {
          pending: await runner.countPending(),
          lastSyncedAt: await runner.lastSyncedAt(sub),
        })
        if (again.current.delete(name)) void runOne(runner, accessToken)
      }
    },
    [sub, patch],
  )

  const syncNow = useCallback(
    async (app?: SyncDomain) => {
      if (!sub) return
      const targets = runners.filter((runner) => !app || runner.name === app)
      if (!navigator.onLine) {
        for (const runner of targets)
          patch(runner.name, { state: 'offline', pending: await runner.countPending() })
        return
      }
      if (!token) return
      // A full sync also renews the session and the list of signed-in devices.
      let accessToken = token
      if (!app) {
        try {
          accessToken = (await refreshSession()).access_token
          updateAuthSessions(accessToken, sub).catch((error: unknown) =>
            console.error('Unable to refresh active sessions', error),
          )
        } catch (error) {
          for (const runner of targets)
            patch(runner.name, {
              state: 'error',
              error: error instanceof Error ? error.message : 'Sync failed',
            })
          return
        }
      }
      await Promise.all(targets.map((runner) => runOne(runner, accessToken)))
    },
    [runners, sub, token, patch, runOne],
  )

  useEffect(() => {
    if (!sub) return
    void (async () => {
      for (const runner of runners)
        patch(runner.name, {
          pending: await runner.countPending(),
          lastSyncedAt: await runner.lastSyncedAt(sub),
        })
    })()
    void syncNow()
    const queued = again.current
    const timers = new Map<SyncDomain | 'all', ReturnType<typeof setTimeout>>()
    const off = onSyncRequested((app) => {
      const key = app ?? 'all'
      clearTimeout(timers.get(key))
      timers.set(
        key,
        setTimeout(() => void syncNow(app), DEBOUNCE_MS),
      )
    })
    const all = () => void syncNow()
    // Coming back to the app catches up on what changed elsewhere.
    const onVisible = () => {
      if (document.visibilityState === 'visible') all()
    }
    window.addEventListener('online', all)
    window.addEventListener('offline', all)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      queued.clear()
      off()
      timers.forEach((timer) => clearTimeout(timer))
      window.removeEventListener('online', all)
      window.removeEventListener('offline', all)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [sub, syncNow, runners, patch])

  const value = useMemo(() => {
    const apps = runners.map((runner) => ({
      name: runner.name,
      label: runner.label,
      ...IDLE,
      ...status[runner.name],
    }))
    return { ...combine(apps), apps, syncNow }
  }, [runners, status, syncNow])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

const Ctx = createContext<SyncStatus | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useSync(): SyncStatus {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSync outside SyncProvider')
  return v
}
