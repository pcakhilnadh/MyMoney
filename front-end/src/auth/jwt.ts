export interface GoogleUser {
  sub: string
  email: string
  name: string
  picture?: string
  exp: number
}

/** Decode (not verify) a Google ID token payload. The server does the verification. */
export function decodeIdToken(token: string): GoogleUser {
  const payload = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
  const json = decodeURIComponent(
    atob(payload)
      .split('')
      .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
      .join(''),
  )
  return JSON.parse(json) as GoogleUser
}

export const isExpired = (u: GoogleUser) => u.exp * 1000 <= Date.now()
