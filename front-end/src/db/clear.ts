import type Dexie from 'dexie'
import { foodDb } from '@/food/db'
import { plateDb } from '@/plate/store'
import { db } from './db'

/** Clears every app's local database (sign-out). */
export async function clearLocalDatabase(): Promise<void> {
  await Promise.all(
    ([db, foodDb, plateDb] as Dexie[]).map((database) =>
      database.transaction('rw', database.tables, async () => {
        await Promise.all(database.tables.map((table) => table.clear()))
      }),
    ),
  )
}
