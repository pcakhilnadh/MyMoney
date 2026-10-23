import { decodeIdToken } from './jwt'
import type { GoogleUser } from './jwt'

export const TOKEN_KEY = 'exptracker.idtoken'
const USER_SUB_KEY = 'exptracker.sub'
const USER_KEY = 'exptracker.user'

/** The Google `sub` of the stored session, or null when signed out. */
export function storedSub(): string | null {
  try {
    const sub = localStorage.getItem(USER_SUB_KEY)
    if (sub) return sub
    const t = localStorage.getItem(TOKEN_KEY)
    return t ? decodeIdToken(t).sub : null
  } catch {
    return null
  }
}

export function storeUser(user: GoogleUser): void {
  localStorage.setItem(USER_SUB_KEY, user.sub)
  localStorage.setItem(USER_KEY, JSON.stringify(user))
}

export function cachedUser(): GoogleUser | null {
  try {
    const value = localStorage.getItem(USER_KEY)
    if (!value) return null
    const user = JSON.parse(value) as GoogleUser
    return typeof user.sub === 'string' &&
      typeof user.email === 'string' &&
      typeof user.exp === 'number'
      ? user
      : null
  } catch {
    return null
  }
}

export function clearStoredUser(): void {
  localStorage.removeItem(USER_KEY)
}

export function clearStoredSession(): void {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(USER_SUB_KEY)
  localStorage.removeItem(USER_KEY)
}
