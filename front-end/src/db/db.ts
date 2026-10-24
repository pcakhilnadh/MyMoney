import Dexie, { type EntityTable } from 'dexie'
import { storedSub } from '@/auth/storage'
import type {
  Account,
  Budget,
  Category,
  DuePayment,
  FoodEntry,
  FoodLibraryItem,
  Habit,
  HabitLog,
  Merchant,
  Transaction,
} from './types'

export class AppDB extends Dexie {
  accounts!: EntityTable<Account, 'id'>
  categories!: EntityTable<Category, 'id'>
  merchants!: EntityTable<Merchant, 'id'>
  transactions!: EntityTable<Transaction, 'id'>
  budgets!: EntityTable<Budget, 'id'>
  due_payments!: EntityTable<DuePayment, 'id'>
  auth_sessions!: EntityTable<
    {
      id: string
      device: string | null
      browser: string | null
      location: string | null
      created_at: number
      last_used_at: number
      is_current: boolean
    },
    'id'
  >
  food_entries!: EntityTable<FoodEntry, 'id'>
  food_library!: EntityTable<FoodLibraryItem, 'id'>
  habits!: EntityTable<Habit, 'id'>
  habit_logs!: EntityTable<HabitLog, 'id'>

  constructor(name = 'exptracker') {
    super(name)
    this.version(1).stores({
      accounts: 'id, status, sync_state',
      categories: 'id, transaction_type, status, sync_state',
      transactions:
        'id, transaction_date, context, group_id, category_id, status, sync_state, [status+transaction_date]',
      budgets: 'id, category_id, status, sync_state',
    })
    this.version(2).stores({
      accounts: 'id, status, sync_state',
      categories: 'id, transaction_type, status, sync_state',
      merchants: 'id, name, status, sync_state',
      transactions:
        'id, transaction_date, context, group_id, category_id, status, sync_state, [status+transaction_date]',
      budgets: 'id, category_id, status, sync_state',
    })
    this.version(3)
      .stores({
        accounts: 'id, status, sync_state',
        categories: 'id, transaction_type, status, sync_state',
        merchants: 'id, &normalized_name, name, status, sync_state',
        transactions:
          'id, transaction_date, context, group_id, category_id, status, sync_state, [status+transaction_date]',
        budgets: 'id, category_id, status, sync_state',
      })
      .upgrade(async (tx) => {
        const merchantsTable = tx.table('merchants')
        const merchants = await merchantsTable.toArray()
        const unique = new Map<string, (typeof merchants)[number]>()
        for (const merchant of merchants) {
          const normalizedName = merchant.name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
          if (!normalizedName) continue
          if (!unique.has(normalizedName)) {
            merchant.name = merchant.name.trim().replace(/\s+/g, ' ')
            merchant.normalized_name = normalizedName
            unique.set(normalizedName, merchant)
          }
        }
        await merchantsTable.clear()
        await merchantsTable.bulkPut([...unique.values()])

        await tx
          .table('transactions')
          .toCollection()
          .modify((transaction) => {
            transaction.title = transaction.title ?? transaction.description
            transaction.long_description ??= null
            delete transaction.description
          })
      })
    this.version(4).stores({
      accounts: 'id, status, sync_state',
      categories: 'id, transaction_type, status, sync_state',
      merchants: 'id, &normalized_name, name, status, sync_state',
      transactions:
        'id, transaction_date, context, group_id, category_id, status, sync_state, [status+transaction_date]',
      budgets: 'id, category_id, status, sync_state',
      due_payments: 'id, account_id, status, sync_state',
    })
    this.version(5).stores({
      accounts: 'id, status, sync_state',
      categories: 'id, transaction_type, status, sync_state',
      merchants: 'id, &normalized_name, name, status, sync_state',
      transactions:
        'id, transaction_date, context, group_id, category_id, status, sync_state, [status+transaction_date]',
      budgets: 'id, category_id, status, sync_state',
      due_payments: 'id, account_id, status, sync_state',
      auth_sessions: 'id',
    })
    this.version(6).stores({
      accounts: 'id, status, sync_state',
      categories: 'id, transaction_type, status, sync_state',
      merchants: 'id, &normalized_name, name, status, sync_state',
      transactions:
        'id, transaction_date, context, group_id, category_id, status, sync_state, [status+transaction_date]',
      budgets: 'id, category_id, status, sync_state',
      due_payments: 'id, account_id, status, sync_state',
      auth_sessions: 'id',
      food_entries: 'id, entry_date, meal, status, sync_state, [entry_date+meal]',
      food_library: 'id, &normalized_name, name, status, sync_state',
      habits: 'id, status, sync_state',
      habit_logs: 'id, habit_id, logged_on, status, sync_state, [habit_id+logged_on]',
    })
  }
}

/** One local database per Google account, so users on a shared browser never mix data. */
export const DB_SUB = storedSub()
export const db = new AppDB(`exptracker-${DB_SUB ?? 'anon'}`)
