import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { clearLocalDatabase } from '@/db/clear'
import { DB_SUB } from '@/db/db'
import { clearSyncState, waitForSync } from '@/sync/engine'
import {
  AUTH_EXPIRED_EVENT,
  ApiError,
  loginWithGoogle,
  logoutSession,
  refreshSession,
  setAccessToken,
  type AuthResponse,
} from './api'
import { decodeIdToken, isExpired, type GoogleUser } from './jwt'
import { cachedUser, clearStoredSession, clearStoredUser, storeUser, TOKEN_KEY } from './storage'

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

interface AuthState {
  user: GoogleUser | null
  token: string | null
  ready: boolean
  signIn: (credential: string) => Promise<void>
  signOut: () => Promise<void>
}

interface Session {
  token: string
  user: GoogleUser
}

const Ctx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)

  const acceptSession = useCallback((auth: AuthResponse) => {
    setAccessToken(auth.access_token)
    storeUser(auth.user)
    localStorage.removeItem(TOKEN_KEY)
    if (auth.user.sub !== DB_SUB) {
      window.location.assign('/welcome')
      return
    }
    setSession({ token: auth.access_token, user: auth.user })
  }, [])

  const signIn = useCallback(
    async (credential: string) => {
      acceptSession(await loginWithGoogle(credential))
    },
    [acceptSession],
  )

  const signOut = useCallback(async () => {
    const sub = session?.user.sub ?? DB_SUB
    if (sub) await waitForSync(sub)
    setAccessToken(null)
    clearStoredSession()
    window.google?.accounts.id.disableAutoSelect()
    setSession(null)
    try {
      await clearLocalDatabase()
      if (sub) clearSyncState(sub)
    } catch (error) {
      console.error('Unable to clear local app data during sign-out', error)
    }
    try {
      await logoutSession()
    } catch (error) {
      console.error('Unable to revoke the server session during sign-out', error)
    }
  }, [session])

  useEffect(() => {
    let active = true
    const restore = async () => {
      const user = cachedUser()
      if (user) {
        if (active) {
          setSession({ token: '', user })
          setReady(true)
        }
        try {
          const auth = await refreshSession()
          if (active) acceptSession(auth)
        } catch (error) {
          if (error instanceof ApiError && error.status === 401) {
            clearStoredUser()
            if (active) setSession(null)
          } else {
            console.error('Unable to refresh the cached app session; continuing with local data', error)
          }
        }
        return
      }

      try {
        let refreshError: unknown
        try {
          const auth = await refreshSession()
          if (active) acceptSession(auth)
          return
        } catch (error) {
          refreshError = error
        }

        const legacyToken = localStorage.getItem(TOKEN_KEY)
        if (legacyToken) {
          let legacyUser: GoogleUser | null = null
          try {
            legacyUser = decodeIdToken(legacyToken)
          } catch (error) {
            localStorage.removeItem(TOKEN_KEY)
            console.error('Unable to decode the previous Google session', error)
          }
          if (legacyUser && isExpired(legacyUser)) {
            localStorage.removeItem(TOKEN_KEY)
            legacyUser = null
          }
          if (legacyUser) {
            try {
              const auth = await loginWithGoogle(legacyToken)
              if (active) acceptSession(auth)
              return
            } catch (error) {
              if (error instanceof TypeError) {
                if (active) {
                  storeUser(legacyUser)
                  setSession({ token: legacyToken, user: legacyUser })
                }
                return
              }
              localStorage.removeItem(TOKEN_KEY)
              console.error('Unable to restore the previous Google session', error)
            }
          }
        }

        if (refreshError instanceof ApiError && refreshError.status === 401) {
          clearStoredUser()
        }
      } finally {
        if (active) setReady(true)
      }
    }

    void restore()
    return () => {
      active = false
    }
  }, [acceptSession])

  useEffect(() => {
    const expired = () => {
      setAccessToken(null)
      clearStoredSession()
      setSession(null)
    }
    window.addEventListener(AUTH_EXPIRED_EVENT, expired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, expired)
  }, [])

  useEffect(() => {
    if (!session) return
    const onOnline = () => {
      void refreshSession()
        .then((auth) => {
          storeUser(auth.user)
          setSession({ token: auth.access_token, user: auth.user })
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 401) {
            const legacyToken = localStorage.getItem(TOKEN_KEY)
            if (legacyToken) {
              try {
                const legacyUser = decodeIdToken(legacyToken)
                if (!isExpired(legacyUser)) {
                  void loginWithGoogle(legacyToken)
                    .then(acceptSession)
                    .catch((loginError: unknown) => {
                      if (loginError instanceof ApiError && loginError.status === 401) {
                        localStorage.removeItem(TOKEN_KEY)
                        window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
                      } else {
                        console.error('Unable to migrate the previous Google session', loginError)
                      }
                    })
                  return
                }
              } catch (decodeError) {
                console.error('Unable to decode the previous Google session', decodeError)
              }
            }
            window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
          } else {
            console.error('Unable to restore the app session after reconnecting', error)
          }
        })
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [session, acceptSession])

  useEffect(() => {
    if (!session) return
    const delay = Math.max(session.user.exp * 1000 - Date.now() - 60_000, 0)
    const timer = window.setTimeout(() => {
      void refreshSession()
        .then((auth) => {
          storeUser(auth.user)
          setSession({ token: auth.access_token, user: auth.user })
        })
        .catch((error: unknown) => {
          if (error instanceof ApiError && error.status === 401) {
            window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
          } else {
            console.error('Unable to refresh the app session', error)
          }
        })
    }, delay)
    return () => window.clearTimeout(timer)
  }, [session])

  const value = useMemo(
    () => ({
      user: session?.user ?? null,
      token: session?.token ?? null,
      ready,
      signIn,
      signOut,
    }),
    [session, ready, signIn, signOut],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth(): AuthState {
  const value = useContext(Ctx)
  if (!value) throw new Error('useAuth outside AuthProvider')
  return value
}
