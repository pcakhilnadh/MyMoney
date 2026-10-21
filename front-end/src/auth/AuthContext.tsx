import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { decodeIdToken, isExpired, type GoogleUser } from './jwt'
import { TOKEN_KEY } from './storage'
import { DB_SUB } from '@/db/db'

const KEY = TOKEN_KEY
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

interface AuthState {
  user: GoogleUser | null
  token: string | null
  signIn: (credential: string) => void
  signOut: () => void
}

const Ctx = createContext<AuthState | null>(null)

function load(): { token: string; user: GoogleUser } | null {
  try {
    const token = localStorage.getItem(KEY)
    if (!token) return null
    const user = decodeIdToken(token)
    return isExpired(user) ? null : { token, user }
  } catch {
    return null
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState(load)

  const signIn = useCallback((credential: string) => {
    localStorage.setItem(KEY, credential)
    // The local database is chosen at load time, so switching accounts needs a fresh load.
    if (decodeIdToken(credential).sub !== DB_SUB) {
      window.location.assign('/home')
      return
    }
    setSession({ token: credential, user: decodeIdToken(credential) })
  }, [])

  const signOut = useCallback(() => {
    localStorage.removeItem(KEY)
    window.google?.accounts.id.disableAutoSelect()
    setSession(null)
  }, [])

  // Drop the session when the ID token expires (Google tokens last ~1h).
  useEffect(() => {
    if (!session) return
    const ms = session.user.exp * 1000 - Date.now()
    const t = setTimeout(signOut, Math.max(ms, 0))
    return () => clearTimeout(t)
  }, [session, signOut])

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      signIn,
      signOut,
    }),
    [session, signIn, signOut],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const v = useContext(Ctx)
  if (!v) throw new Error('useAuth outside AuthProvider')
  return v
}
