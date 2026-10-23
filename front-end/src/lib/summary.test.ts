import { describe, expect, it } from 'vitest'
import type { Category, Transaction } from '@/db/types'
import { byCategory, monthTotal, monthlySeries, toCsv } from './summary'

const t = (date: string, amount: number, cat: string | null = null, type = 'expense') =>
  ({
    transaction_date: date,
    amount_minor: amount,
    category_id: cat,
    transaction_type: type,
    title: 'a "b"',
  }) as Transaction
const cats = [{ id: 'f', name: 'Food' }] as Category[]

describe('summary', () => {
  const txs = [
    t('2026-10-01', 100, 'f'),
    t('2026-10-09', 50),
    t('2026-09-30', 70, 'f'),
    t('2026-10-02', 999, 'f', 'income'),
  ]
  it('totals a month, ignoring income', () => expect(monthTotal(txs, '2026-10')).toBe(150))
  it('groups by category', () =>
    expect(byCategory(txs, cats, '2026-10')).toEqual([
      { name: 'Food', value: 100 },
      { name: 'Uncategorised', value: 50 },
    ]))
  it('builds a 3 month series', () =>
    expect(monthlySeries(txs, '2026-10', 3).map((p) => p.value)).toEqual([0, 70, 150]))
  it('escapes csv', () => expect(toCsv([txs[0]], cats)).toContain('"a ""b"""'))
})
