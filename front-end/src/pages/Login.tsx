import { Navigate } from 'react-router-dom'
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
  if (user) return <Navigate to="/home" replace />
  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-between px-8 py-14">
      <div className="gloss flex size-14 items-center justify-center rounded-2xl text-2xl font-bold">
        ₹
      </div>
      <div className="space-y-4">
        <h1 className="text-[40px] leading-[1.05] font-extrabold tracking-tight">
          Track expenses together,{' '}
          <span className="bg-gradient-to-r from-[#a99dff] to-[#4ae3b5] bg-clip-text text-transparent">
            effortlessly.
          </span>
        </h1>
        <p className="text-base text-muted-foreground">
          Personal, family and group spending in one place. Works offline.
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
