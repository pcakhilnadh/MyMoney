import type { EntityTable, Table } from 'dexie'
import { requestSync } from '@/sync/bus'
import type { Syncable } from './types'

type NewRecord<T extends Syncable> = Omit<
  T,
  'id' | 'version' | 'sync_state' | 'status' | 'created_at' | 'updated_at'
>

/**
 * Local-first repository. The UI talks only to this, so a sync module can later
 * hook in via `sync_state` without touching screens.
 */
export class Repository<T extends Syncable> {
  private table: Table<T, string>

  constructor(table: EntityTable<T, 'id'>) {
    this.table = table as unknown as Table<T, string>
  }

  async list(): Promise<T[]> {
    return (await this.table.toArray()).filter((r) => r.status !== 'deleted')
  }

  async get(id: string): Promise<T | undefined> {
    const r = await this.table.get(id)
    return r && r.status !== 'deleted' ? r : undefined
  }

  async create(data: NewRecord<T>): Promise<T> {
    const now = new Date().toISOString()
    const record = {
      ...data,
      id: crypto.randomUUID(),
      version: 1,
      sync_state: 'pending',
      status: 'active',
      created_at: now,
      updated_at: now,
    } as unknown as T
    await this.table.add(record)
    requestSync()
    return record
  }

  async update(id: string, changes: Partial<NewRecord<T>>): Promise<T> {
    const current = await this.table.get(id)
    if (!current) throw new Error(`Record ${id} not found`)
    const next = {
      ...current,
      ...changes,
      version: current.version + 1,
      sync_state: 'pending',
      updated_at: new Date().toISOString(),
    } as T
    await this.table.put(next)
    requestSync()
    return next
  }

  /** Soft delete so the deletion can be synced later. */
  async remove(id: string): Promise<void> {
    const current = await this.table.get(id)
    if (!current) return
    await this.table.put({
      ...current,
      status: 'deleted',
      version: current.version + 1,
      sync_state: 'pending',
      updated_at: new Date().toISOString(),
    })
    requestSync()
  }
}
