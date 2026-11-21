import Dexie, { type EntityTable } from 'dexie'
import { DB_SUB, db, type FoodSetting } from '@/db/db'
import type { MealLog } from '@/db/types'

/** My Food's own local database, synced on its own through /sync/food. */
export class FoodDB extends Dexie {
  meal_logs!: EntityTable<MealLog, 'id'>
  food_settings!: EntityTable<FoodSetting, 'key'>

  constructor(name = 'myfood') {
    super(name)
    this.version(1).stores({
      meal_logs: 'id, entry_date, meal, food_id, status, sync_state, [entry_date+meal]',
      food_settings: 'key',
    })
  }
}

/** One local database per Google account, like My Money's. */
export const foodDb = new FoodDB(`myfood-${DB_SUB ?? 'anon'}`)

/**
 * My Food used to live in My Money's database. Move it once: unsynced rows always win, and
 * the rest only fill gaps, so nothing already pulled into the new database is overwritten.
 * TODO(after-v1): remove this move with the old tables in AppDB.
 */
export async function moveFoodData(source = db, target = foodDb): Promise<void> {
  const [logs, settings] = await Promise.all([
    source.meal_logs.toArray(),
    source.food_settings.toArray(),
  ])
  if (logs.length === 0 && settings.length === 0) return
  await target.transaction('rw', target.meal_logs, target.food_settings, async () => {
    const have = new Set(
      (await target.meal_logs.bulkGet(logs.map((log) => log.id))).flatMap((log) =>
        log ? [log.id] : [],
      ),
    )
    await target.meal_logs.bulkPut(
      logs.filter((log) => log.sync_state !== 'synced' || !have.has(log.id)),
    )
    for (const setting of settings)
      if (!(await target.food_settings.get(setting.key))) await target.food_settings.put(setting)
  })
  await source.transaction('rw', source.meal_logs, source.food_settings, async () => {
    await source.meal_logs.clear()
    await source.food_settings.clear()
  })
}

/** Food screens and food sync wait for the move, which only does work once. */
export const foodReady: Promise<void> = moveFoodData().catch((error: unknown) => {
  console.error('Unable to move My Food data into its own database', error)
})
