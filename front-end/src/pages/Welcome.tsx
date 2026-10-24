import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { cachedUser } from '@/auth/storage'
import { useSync } from '@/sync/SyncProvider'

const MIN_VISIBLE_MS = 3000

// Post-login landing; SyncGate has already waited for the initial sync by the time this renders.
export default function Welcome() {
  return <Navigate to="/money/home" replace />
}

// Holds every signed-in route behind the breathing screen until the first sync succeeds.
export function SyncGate({ children }: { children: ReactNode }) {
  const { initialSyncDone, state, error, syncNow } = useSync()
  const { token } = useAuth()
  const [minElapsed, setMinElapsed] = useState(false)
  const [skipped, setSkipped] = useState(false)
  const [online, setOnline] = useState(navigator.onLine)

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS)
    const on = () => setOnline(true)
    const off = () => setOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  if (skipped || (initialSyncDone && minElapsed)) return <>{children}</>

  const blocked = !online || !token || state === 'offline' || state === 'error'
  const status = !online || state === 'offline'
    ? 'You’re offline. We’ll finish setting up once you’re connected.'
    : state === 'error'
      ? `Couldn’t fetch your data${error ? ` (${error})` : ''}.`
      : 'Fetching your latest data…'

  return (
    <BreathingScreen status={status}>
      {blocked && (
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => void syncNow()}
            className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => setSkipped(true)}
            className="rounded-xl bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground"
          >
            Continue with local data
          </button>
        </div>
      )}
    </BreathingScreen>
  )
}

export function BreathingScreen({
  status,
  children,
}: {
  status?: string
  children?: ReactNode
}) {
  const { user } = useAuth()
  const name = (user ?? cachedUser())?.name
  const firstName = name?.trim().split(/\s+/)[0]
  return (
    <main
      data-app="money"
      role="status"
      aria-live="polite"
      className="welcome-screen relative mx-auto flex min-h-screen max-w-md flex-col items-center justify-center overflow-hidden px-8 text-center"
    >
      <div className="welcome-orb" aria-hidden="true">
        <span className="welcome-ring welcome-ring-1" />
        <span className="welcome-ring welcome-ring-2" />
        <span className="welcome-ring welcome-ring-3" />
        <span className="welcome-core" />
        <span className="welcome-orbit">
          <i />
        </span>
        <span className="welcome-orbit welcome-orbit-2">
          <i />
        </span>
      </div>

      <div className="relative mt-16 h-9 w-full text-3xl font-extrabold tracking-tight">
        <span className="welcome-word welcome-in">Breathe in</span>
        <span className="welcome-word welcome-out">Breathe out</span>
      </div>
      <p className="mt-3 text-lg font-semibold">
        {firstName ? `Hi ${firstName}, hang tight.` : 'Hang tight.'}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        {status ?? 'Getting your personal tracker ready…'}
      </p>
      {children}
    </main>
  )
}
