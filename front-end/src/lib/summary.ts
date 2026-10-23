import type { Category, Transaction } from '@/db/types'

const monthKey = (iso: string) => iso.slice(0, 7) // YYYY-MM

export const currentMonth = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

const spend = (txs: Transaction[]) => txs.filter((t) => t.transaction_type === 'expense')

export function monthTotal(txs: Transaction[], month: string): number {
  return spend(txs)
    .filter((t) => monthKey(t.transaction_date) === month)
    .reduce((n, t) => n + t.amount_minor, 0)
}

export function byCategory(
  txs: Transaction[],
  cats: Category[],
  month: string,
): { name: string; value: number }[] {
  const names = new Map(cats.map((c) => [c.id, c.name]))
  const totals = new Map<string, number>()
  for (const t of spend(txs)) {
    if (monthKey(t.transaction_date) !== month) continue
    const name = (t.category_id && names.get(t.category_id)) || 'Uncategorised'
    totals.set(name, (totals.get(name) ?? 0) + t.amount_minor)
  }
  return [...totals].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value)
}

/** Last `n` months ending at `end`, oldest first. */
export function monthlySeries(txs: Transaction[], end: string, n = 6) {
  const [y, m] = end.split('-').map(Number)
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(y, m - 1 - (n - 1 - i), 1)
    const key = currentMonth(d)
    return {
      name: d.toLocaleString('en', { month: 'short' }),
      value: monthTotal(txs, key),
    }
  })
}

export function toCsv(txs: Transaction[], cats: Category[]): string {
  const names = new Map(cats.map((c) => [c.id, c.name]))
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`
  const rows = txs.map((t) =>
    [
      t.transaction_date.slice(0, 10),
      esc(t.title),
      esc(t.merchant ?? ''),
      esc(t.long_description ?? ''),
      esc((t.category_id && names.get(t.category_id)) || ''),
      (t.amount_minor / 100).toFixed(2),
      t.transaction_type,
    ].join(','),
  )
  return ['date,title,merchant,long_description,category,amount,type', ...rows].join('\n')
}
