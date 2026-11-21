import { beforeEach, describe, expect, it, vi } from 'vitest'
import { routeLabel } from './labels'
import { previousPath, rememberEntry, saveSpot, spotFor } from './memory'

// A browser tab's history position and session storage, without a browser.
let idx = 0
beforeEach(() => {
  idx = 0
  const store = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
  })
  vi.stubGlobal('window', {
    history: {
      get state() {
        return { idx }
      },
    },
  })
})

function visit(path: string) {
  idx += 1
  rememberEntry(path, true)
}

describe('back trail', () => {
  it('knows the screen one step back, and nothing before the first', () => {
    rememberEntry('/money/home', true)
    expect(previousPath()).toBeNull()
    visit('/money/transactions?month=2026-10')
    visit('/money/transactions/abc')
    expect(previousPath()).toBe('/money/transactions?month=2026-10')
  })

  it('follows browser back and forward, and forgets what a new step replaces', () => {
    rememberEntry('/money/home', true)
    visit('/money/transactions')
    visit('/money/transactions/abc')
    idx = 1 // browser back
    rememberEntry('/money/transactions', false)
    expect(previousPath()).toBe('/money/home')
    visit('/money/budgets')
    visit('/money/budgets/categories/c1')
    expect(previousPath()).toBe('/money/budgets')
  })

  it('a changed address on the same step (month, filter) replaces it', () => {
    rememberEntry('/money/transactions', true)
    rememberEntry('/money/transactions?month=2026-09', false)
    visit('/money/transactions/abc')
    expect(previousPath()).toBe('/money/transactions?month=2026-09')
  })
})

describe('spots', () => {
  it('are found by history entry, or else by the latest for the same address', () => {
    saveSpot('k1', { path: '/money/transactions', y: 100, anchor: 'a' })
    saveSpot('k2', { path: '/money/transactions', y: 900, anchor: 'b' })
    expect(spotFor('k1', '/money/transactions')?.anchor).toBe('a')
    expect(spotFor('new', '/money/transactions')?.anchor).toBe('b')
    expect(spotFor('new', '/money/budgets')).toBeNull()
  })
})

describe('routeLabel', () => {
  it('names the screen a back button returns to', () => {
    expect(routeLabel('/money/transactions?month=2026-10')).toBe('Transactions')
    expect(routeLabel('/money/accounts/acc-1')).toBe('Account')
    expect(routeLabel('/money/budgets/categories/c1')).toBe('Category')
    expect(routeLabel('/plate/kitchens')).toBe('Kitchens')
    expect(routeLabel('/somewhere/else')).toBe('Back')
  })
})
