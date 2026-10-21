import { describe, expect, it } from 'vitest'
import { decodeIdToken, isExpired } from './jwt'

const b64 = (o: object) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(o))))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '')

describe('decodeIdToken', () => {
  it('reads claims and detects expiry', () => {
    const t = `h.${b64({ sub: '1', email: 'a@gmail.com', name: 'Aé', exp: 1 })}.s`
    const u = decodeIdToken(t)
    expect(u.email).toBe('a@gmail.com')
    expect(isExpired(u)).toBe(true)
  })
})
