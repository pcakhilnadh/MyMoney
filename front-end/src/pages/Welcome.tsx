import { Navigate } from 'react-router-dom'
import { useAuth } from '@/auth/AuthContext'
import { cachedUser } from '@/auth/storage'

// Keep the old post-login URL working without blocking entry on a network sync.
export default function Welcome() {
  return <Navigate to="/money/home" replace />
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
