import type { GoogleUser } from './jwt'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
export const AUTH_EXPIRED_EVENT = 'mymoney:auth-expired'

export interface AuthResponse {
  access_token: string
  token_type: 'bearer'
  user: GoogleUser
}

export interface AuthSession {
  id: string
  device: string | null
  browser: string | null
  location: string | null
  created_at: number
  last_used_at: number
  is_current: boolean
}

export class ApiError extends Error {
  status: number
  constructor(status: number, detail: string) {
    super(detail)
    this.status = status
  }
}

let accessToken: string | null = null
let refreshPromise: Promise<AuthResponse> | null = null

export function setAccessToken(token: string | null): void {
  accessToken = token
}

async function readError(response: Response): Promise<ApiError> {
  let detail = `API ${response.status}`
  try {
    const body = await response.json()
    if (typeof body.detail === 'string') detail = body.detail
  } catch {
    // The API may return a non-JSON error body.
  }
  return new ApiError(response.status, detail)
}

async function authRequest(path: string, body?: object): Promise<AuthResponse> {
  const response = await fetch(BASE + path, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) throw await readError(response)
  const result = (await response.json()) as AuthResponse
  setAccessToken(result.access_token)
  return result
}

export function loginWithGoogle(credential: string): Promise<AuthResponse> {
  return authRequest('/auth/login', { credential })
}

export function refreshSession(): Promise<AuthResponse> {
  if (!refreshPromise) {
    refreshPromise = authRequest('/auth/refresh')
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.status === 401) setAccessToken(null)
        throw error
      })
      .finally(() => {
        refreshPromise = null
      })
  }
  return refreshPromise
}

async function refreshForApi(): Promise<AuthResponse> {
  try {
    return await refreshSession()
  } catch (error) {
    if (error instanceof ApiError && error.status === 401 && typeof window !== 'undefined') {
      window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT))
    }
    throw error
  }
}

export async function logoutSession(): Promise<void> {
  const response = await fetch(BASE + '/auth/logout', {
    method: 'POST',
    credentials: 'include',
  })
  if (!response.ok) throw await readError(response)
}

export function fetchAuthSessions(token: string): Promise<AuthSession[]> {
  return fetch(BASE + '/auth/sessions', {
    headers: { Authorization: `Bearer ${token}` },
    credentials: 'include',
  }).then(async (response) => {
    if (!response.ok) throw await readError(response)
    return (await response.json()) as AuthSession[]
  })
}

export function revokeAuthSession(token: string, sessionId: string): Promise<void> {
  return api<void>(`/auth/sessions/${encodeURIComponent(sessionId)}`, token, {
    method: 'DELETE',
  })
}

async function request(path: string, token: string, init: RequestInit): Promise<Response> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${token}`)
  if (init.body != null && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }
  return fetch(BASE + path, {
    ...init,
    headers,
    credentials: 'include',
  })
}

export async function api<T>(path: string, token: string, init: RequestInit = {}): Promise<T> {
  let currentToken = accessToken ?? token
  if (!currentToken) currentToken = (await refreshForApi()).access_token

  let response = await request(path, currentToken, init)
  if (response.status === 401) {
    currentToken = (await refreshForApi()).access_token
    response = await request(path, currentToken, init)
  }
  if (!response.ok) throw await readError(response)
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T)
}
