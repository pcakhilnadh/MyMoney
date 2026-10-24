import { useEffect, useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import type { NavigateFunction } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useAuth } from '@/auth/AuthContext'
import { cachedUser } from '@/auth/storage'
import { useSync } from '@/sync/SyncProvider'

const MIN_VISIBLE_MS = 3000
const OFFLINE_FALLBACK_MS = 20000

// Post-login landing; SyncGate has already waited for the initial sync by the time this renders.
export default function Welcome() {
  return <Navigate to="/money/home" replace />
}

// Holds signed-in routes behind the breathing screen until the first sync succeeds.
// If it can't (offline / server unreachable), the app opens on local data after
// OFFLINE_FALLBACK_MS and SyncProvider syncs once the connection is back.
export function SyncGate({
  authReady,
  children,
}: {
  authReady: boolean
  children: ReactNode
}) {
  const { initialSyncDone } = useSync()
  const navigate = useNavigate()
  const [minElapsed, setMinElapsed] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  const [landed, setLanded] = useState(false)

  useEffect(() => {
    const minTimer = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS)
    const fallbackTimer = setTimeout(() => setTimedOut(true), OFFLINE_FALLBACK_MS)
    return () => {
      clearTimeout(minTimer)
      clearTimeout(fallbackTimer)
    }
  }, [])

  if (authReady && ((initialSyncDone && minElapsed) || timedOut)) {
    if (!landed) return <LandHome onLand={() => setLanded(true)} navigate={navigate} />
    return <>{children}</>
  }

  return <BreathingScreen />
}

// The welcome screen always hands over to /money/home, whatever URL the app was opened on.
function LandHome({
  onLand,
  navigate,
}: {
  onLand: () => void
  navigate: NavigateFunction
}) {
  useEffect(() => {
    navigate('/money/home', { replace: true })
    onLand()
  }, [navigate, onLand])
  return <BreathingScreen />
}

export function BreathingScreen() {
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
        Getting your personal tracker ready…
      </p>
    </main>
  )
}
