import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, setAccessToken } from './api'

describe('api session refresh', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    setAccessToken(null)
  })

  it('refreshes and retries once when the access token expires', async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: 'fresh-access-token',
            token_type: 'bearer',
            user: { sub: 'user-1', email: 'user@example.com', name: 'User', exp: 123 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(api<{ ok: boolean }>('/auth/me', 'expired-access-token')).resolves.toEqual({
      ok: true,
    })

    expect(fetchMock).toHaveBeenCalledTimes(3)
    const firstRequest = fetchMock.mock.calls[0][1]
    const refreshRequest = fetchMock.mock.calls[1][1]
    const retryRequest = fetchMock.mock.calls[2][1]
    expect(new Headers(firstRequest?.headers).get('Authorization')).toBe(
      'Bearer expired-access-token',
    )
    expect(refreshRequest?.credentials).toBe('include')
    expect(new Headers(retryRequest?.headers).get('Authorization')).toBe('Bearer fresh-access-token')
  })
})
