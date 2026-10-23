import { db } from './db'

export async function clearLocalDatabase(): Promise<void> {
  await db.transaction(
    'rw',
    db.accounts,
    db.categories,
    db.merchants,
    db.transactions,
    db.budgets,
    async () => {
      await Promise.all(db.tables.map((table) => table.clear()))
    },
  )
}
