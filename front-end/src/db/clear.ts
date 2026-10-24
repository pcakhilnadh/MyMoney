import { db } from './db'

export async function clearLocalDatabase(): Promise<void> {
  await db.transaction(
    'rw',
    db.tables,
    async () => {
      await Promise.all(db.tables.map((table) => table.clear()))
    },
  )
}
