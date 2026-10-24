import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useSync } from '@/sync/SyncProvider'

const MIN_VISIBLE_MS = 3000

export default function Welcome() {
  const { initialSyncDone } = useSync()
  const [minElapsed, setMinElapsed] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setMinElapsed(true), MIN_VISIBLE_MS)
    return () => clearTimeout(timer)
  }, [])

  if (initialSyncDone && minElapsed) return <Navigate to="/money/home" replace />

  return <BreathingScreen />
}

export function BreathingScreen() {
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
      <p className="mt-3 text-base text-muted-foreground">
        We’re getting things ready.
      </p>
      <p className="mt-1 text-sm text-muted-foreground/70">Your personal tracker</p>
    </main>
  )
}
