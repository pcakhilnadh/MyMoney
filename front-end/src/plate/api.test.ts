import { beforeEach, describe, expect, it } from 'vitest'
import * as api from './api'
import { createMockDb, ME } from './mockData'

const home = async () => (await api.listKitchens()).find((k) => k.id === 'k-home')!

describe('live shopping presence', () => {
  beforeEach(() => api.resetMockDb(createMockDb('2026-11-21')))

  it('goes live and stops, keeping other shoppers', async () => {
    await api.setShopping(['k-home'], true)
    let kitchen = await home()
    expect(kitchen.shopping_now).toEqual(['maya', ME])
    expect(kitchen.shopping_since[ME]).toBeTruthy()

    await api.setShopping(['k-home'], false)
    kitchen = await home()
    expect(kitchen.shopping_now).toEqual(['maya'])
    expect(kitchen.shopping_since[ME]).toBeUndefined()
  })

  it('ends presence that was left on for over an hour', async () => {
    const db = createMockDb('2026-11-21')
    const kitchen = db.kitchens.find((k) => k.id === 'k-home')!
    kitchen.shopping_since.maya = new Date(Date.now() - api.SHOPPING_TTL_MS - 60_000).toISOString()
    api.resetMockDb(db)
    expect((await home()).shopping_now).toEqual([])
  })

  it('has no live mode in My Kitchen', async () => {
    await expect(api.setShopping(['k-me'], true)).rejects.toThrow(/nobody to tell/)
  })
})
