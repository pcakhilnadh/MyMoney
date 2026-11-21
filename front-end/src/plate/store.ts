/**
 * MyPlate's own local database. Screens read only from here, so MyPlate opens instantly and
 * works offline. Writes land here first and wait in `outbox` until sync sends them.
 */
import Dexie, { type EntityTable } from 'dexie'
import { DB_SUB } from '@/db/db'
import type {
  GroceryItem,
  Idea,
  Kitchen,
  KitchenInvite,
  Meal,
  PlateSettings,
  PlateUser,
} from './types'

/** One saved change, replayed against the /plate API in order. */
export interface OutboxCommand {
  seq?: number
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  body?: unknown
  /** The row it changes; a pull never overwrites rows with changes still waiting. */
  entity?: 'meals' | 'grocery_items' | 'ideas' | 'settings' | 'kitchens'
  entity_id?: string
}

export interface PlateMeta {
  me: PlateUser
  settings: PlateSettings
  contact_ids: string[]
  /** Server time of the last pull; the next pull asks for changes after it. */
  cursor: string
  /** Meals before this date stay on the server until a past week is opened. */
  meals_from: string
  last_synced_at: string
}

type MetaRow = { [K in keyof PlateMeta]: { key: K; value: PlateMeta[K] } }[keyof PlateMeta]

export class PlateDB extends Dexie {
  kitchens!: EntityTable<Kitchen, 'id'>
  meals!: EntityTable<Meal, 'id'>
  grocery_items!: EntityTable<GroceryItem, 'id'>
  ideas!: EntityTable<Idea, 'id'>
  people!: EntityTable<PlateUser, 'id'>
  invites!: EntityTable<KitchenInvite, 'id'>
  meta!: EntityTable<MetaRow, 'key'>
  outbox!: EntityTable<OutboxCommand, 'seq'>

  constructor(name = 'myplate') {
    super(name)
    this.version(1).stores({
      kitchens: 'id',
      meals: 'id, group_id, meal_date',
      grocery_items: 'id, group_id',
      ideas: 'id, group_id',
      people: 'id',
      invites: 'id',
      meta: 'key',
      outbox: '++seq',
    })
  }

  async getMeta<K extends keyof PlateMeta>(key: K): Promise<PlateMeta[K] | undefined> {
    const row = await this.meta.get(key)
    return row?.value as PlateMeta[K] | undefined
  }

  setMeta<K extends keyof PlateMeta>(key: K, value: PlateMeta[K]) {
    return this.meta.put({ key, value } as MetaRow)
  }
}

/** One local database per Google account, like My Money's. */
export const plateDb = new PlateDB(`myplate-${DB_SUB ?? 'anon'}`)
