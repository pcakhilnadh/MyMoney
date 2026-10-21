import { decodeIdToken } from './jwt'

export const TOKEN_KEY = 'exptracker.idtoken'

/** The Google `sub` of the stored session, or null when signed out. */
export function storedSub(): string | null {
  try {
    const t = localStorage.getItem(TOKEN_KEY)
    return t ? decodeIdToken(t).sub : null
  } catch {
    return null
  }
}
