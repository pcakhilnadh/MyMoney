import Dexie, { type EntityTable } from 'dexie'
import { storedSub } from '@/auth/storage'
import type { Account, Budget, Category, Merchant, Transaction } from './types'

export class AppDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>
  categories!: EntityTable<Category, 'id'>
  merchants!: EntityTable<Merchant, 'id'>
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
    this.version(2)
      .stores({
        accounts: 'id, status, sync_state',
        categories: 'id, transaction_type, status, sync_state',
        merchants: 'id, name, status, sync_state',
        transactions:
          'id, transaction_date, context, group_id, category_id, status, sync_state, [status+transaction_date]',
        budgets: 'id, category_id, status, sync_state',
      })
      .upgrade(async (tx) => {
        await tx
          .table('transactions')
          .toCollection()
          .modify((transaction) => {
            transaction.title = transaction.title ?? transaction.description
            transaction.long_description ??= null
            delete transaction.description
          })
      })
  }
}

/** One local database per Google account, so users on a shared browser never mix data. */
export const DB_SUB = storedSub()
export const db = new AppDB(`exptracker-${DB_SUB ?? 'anon'}`)
