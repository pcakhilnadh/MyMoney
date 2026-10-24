import { Navigate } from 'react-router-dom'
import { Activity } from 'lucide-react'
import { useAuth } from '@/auth/AuthContext'
import GoogleButton from '@/auth/GoogleButton'

export default function Login() {
  const { user, ready } = useAuth()
  if (!ready)
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">
        Restoring your session…
      </div>
    )
  if (user) return <Navigate to="/money/home" replace />
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-between px-8 py-14">
      <div className="flex items-center gap-3">
        <div className="gloss flex size-14 items-center justify-center rounded-2xl">
          <Activity size={28} strokeWidth={2.25} aria-hidden="true" />
        </div>
        <span className="text-xl font-bold">MyTracker</span>
      </div>
      <div className="space-y-4">
        <h1 className="text-[40px] leading-[1.05] font-extrabold tracking-tight">
          Manage your money,{' '}
          <span className="bg-gradient-to-r from-primary to-positive bg-clip-text text-transparent">
            with more tools coming soon.
          </span>
        </h1>
        <p className="text-base text-muted-foreground">
          Keep track of the things that matter to you. Works offline.
        </p>
      </div>
      <div className="space-y-3">
        <GoogleButton />
        <p className="text-xs text-muted-foreground">
          Your sign-in stays active on this device until you sign out.
        </p>
      </div>
    </div>
  )
}
