import Dexie, { type EntityTable } from 'dexie'
import { storedSub } from '@/auth/storage'
import type { Account, Budget, Category, Transaction } from './types'

export class AppDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>
  categories!: EntityTable<Category, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  budgets!: EntityTable<Budget, 'id'>

  constructor(name = 'exptracker') {
    super(name)
    this.version(1).stores({
      accounts: 'id, status, sync_state',
      categories: 'id, transaction_type, status, sync_state',
      transactions:
        'id, transaction_date, context, group_id, category_id, status, sync_state, [status+transaction_date]',
      budgets: 'id, category_id, status, sync_state',
    })
  }
}

/** One local database per Google account, so users on a shared browser never mix data. */
export const DB_SUB = storedSub()
export const db = new AppDB(`exptracker-${DB_SUB ?? 'anon'}`)
