import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { countPending, lastSyncKey, runSync } from './engine'
import { onSyncRequested } from './bus'

export interface SyncStatus {
  state: 'idle' | 'syncing' | 'offline' | 'error'
  pending: number
  lastSyncedAt: string | null
  error: string | null
  syncNow: () => void
}

const Ctx = createContext<SyncStatus | null>(null)

export function SyncProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth()
  const sub = user?.sub ?? null
  const [state, setState] = useState<SyncStatus['state']>('idle')
  const [pending, setPending] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [last, setLast] = useState<string | null>(null)
  const running = useRef(false)
  const again = useRef(false)

  const syncNow = useCallback(async () => {
    if (!token || !sub) return
    if (!navigator.onLine) {
      setState('offline')
      setPending(await countPending())
      return
    }
    if (running.current) {
      again.current = true
      return
    }
    running.current = true
    setState('syncing')
    try {
      await runSync(token, sub)
      setError(null)
      setState('idle')
      setLast(localStorage.getItem(lastSyncKey(sub)))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sync failed')
      setState('error')
    } finally {
      running.current = false
      setPending(await countPending())
      if (again.current) {
        again.current = false
        void syncNow()
      }
    }
  }, [token, sub])

  useEffect(() => {
    if (!sub) return
    setLast(localStorage.getItem(lastSyncKey(sub)))
    void syncNow()
    let debounce: ReturnType<typeof setTimeout>
    const off = onSyncRequested(() => {
      clearTimeout(debounce)
      debounce = setTimeout(() => void syncNow(), 1000)
    })
    const onOnline = () => void syncNow()
    const onOffline = () => setState('offline')
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    const timer = setInterval(() => void syncNow(), 60_000)
    return () => {
      again.current = false
      off()
      clearTimeout(debounce)
      clearInterval(timer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [sub, syncNow])

  const value = useMemo(
    () => ({ state, pending, lastSyncedAt: last, error, syncNow: () => void syncNow() }),
    [state, pending, last, error, syncNow],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSync(): SyncStatus {
  const v = useContext(Ctx)
  if (!v) throw new Error('useSync outside SyncProvider')
  return v
}
