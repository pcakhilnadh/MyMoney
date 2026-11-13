import Dexie from 'dexie'
import { db } from './db'
import { Repository, type NewRecord } from './repository'
import type {
  Account,
  Budget,
  Category,
  DuePayment,
  MealLog,
  Merchant,
  Syncable,
  Transaction,
} from './types'
import { requestSync } from '@/sync/bus'
import {
  categoryTypeForTransaction,
  transferCategoryAccountError,
} from '@/lib/transaction-categories'

class AccountsRepository extends Repository<Account> {
  private async clearOtherDefaults(id?: string): Promise<void> {
    const accounts = await db.accounts.toArray()
    const now = new Date().toISOString()
    await db.accounts.bulkPut(
      accounts
        .filter((account) => account.is_default && account.id !== id)
        .map((account) => ({
          ...account,
          is_default: false,
          version: account.version + 1,
          sync_state: 'pending' as const,
          updated_at: now,
        })),
    )
  }

  async create(data: NewRecord<Account>): Promise<Account> {
    const record = await db.transaction('rw', db.accounts, async () => {
      if (data.is_default) await this.clearOtherDefaults()
      return super.create(data)
    })
    requestSync()
    return record
  }

  async update(
    id: string,
    changes: Partial<NewRecord<Account>> & { status?: 'active' | 'archived' },
  ): Promise<Account> {
    const record = await db.transaction('rw', db.accounts, async () => {
      const current = await db.accounts.get(id)
      if (!current || current.status === 'deleted') throw new Error('Account not found')
      const status = changes.status ?? current.status
      if (changes.is_default && status !== 'active') throw new Error('Only active accounts can be the default')
      if (changes.is_default) await this.clearOtherDefaults(id)
      return super.update(id, status === 'active' ? changes : { ...changes, is_default: false })
    })
    requestSync()
    return record
  }

  async remove(id: string): Promise<void> {
    await db.transaction('rw', db.accounts, async () => {
      const current = await db.accounts.get(id)
      if (!current || current.status === 'deleted') return
      await db.accounts.put({
        ...current,
        is_default: false,
        status: 'deleted',
        version: current.version + 1,
        sync_state: 'pending',
        updated_at: new Date().toISOString(),
      })
    })
    requestSync()
  }
}

export const accountsRepo = new AccountsRepository(db.accounts)
export const budgetsRepo = new Repository<Budget>(db.budgets)
export const duePaymentsRepo = new Repository<DuePayment>(db.due_payments)

class MealLogsRepository extends Repository<MealLog> {
  /** Save a whole meal as local rows first; sync pushes them in the background. */
  async createMany(data: NewRecord<MealLog>[]): Promise<MealLog[]> {
    const now = new Date().toISOString()
    const records: MealLog[] = data.map((item) => ({
      ...item,
      id: crypto.randomUUID(),
      version: 1,
      sync_state: 'pending',
      status: 'active',
      created_at: now,
      updated_at: now,
    }))
    await db.transaction('rw', db.meal_logs, () => db.meal_logs.bulkAdd(records))
    requestSync()
    return records
  }
}

export const mealLogsRepo = new MealLogsRepository(db.meal_logs)

class CategoriesRepository extends Repository<Category> {
  async removeWithTransactions(id: string): Promise<void> {
    await db.transaction('rw', db.categories, db.transactions, db.budgets, async () => {
      const category = await db.categories.get(id)
      if (!category || category.status === 'deleted') return
      if (category.is_system) throw new Error('Default categories cannot be deleted')

      const now = new Date().toISOString()
      const deletedRecord = <T extends Syncable>(record: T): T => ({
        ...record,
        status: 'deleted',
        version: record.version + 1,
        sync_state: 'pending',
        updated_at: now,
      })

      const transactions = await db.transactions.where('category_id').equals(id).toArray()
      const budgets = await db.budgets.where('category_id').equals(id).toArray()
      await Promise.all([
        db.categories.put(deletedRecord(category)),
        db.transactions.bulkPut(
          transactions
            .filter((transaction) => transaction.status !== 'deleted')
            .map(deletedRecord),
        ),
        db.budgets.bulkPut(
          budgets.filter((budget) => budget.status !== 'deleted').map(deletedRecord),
        ),
      ])
    })
    requestSync()
  }
}

export const categoriesRepo = new CategoriesRepository(db.categories)

class MerchantsRepository extends Repository<Merchant> {
  async ensure(name: string): Promise<void> {
    const normalizedName = name.trim().replace(/\s+/g, ' ').toLocaleLowerCase()
    if (!normalizedName) return
    const existing = await db.merchants.where('normalized_name').equals(normalizedName).first()
    if (!existing) {
      const normalized = name.trim().replace(/\s+/g, ' ')
      try {
        await this.create({ name: normalized, normalized_name: normalizedName })
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'ConstraintError')) throw error
      }
    }
  }
}

export const merchantsRepo = new MerchantsRepository(db.merchants)

function newestTransactionFirst(a: Transaction, b: Transaction): number {
  return (
    b.transaction_date.slice(0, 10).localeCompare(a.transaction_date.slice(0, 10)) ||
    b.created_at.localeCompare(a.created_at)
  )
}

class TransactionsRepository extends Repository<Transaction> {
  async create(
    data: Omit<
      Transaction,
      'id' | 'version' | 'sync_state' | 'status' | 'created_at' | 'updated_at'
    >,
  ): Promise<Transaction> {
    const account = data.account_id ? await accountsRepo.get(data.account_id) : undefined
    if (data.transaction_type !== 'transfer' && account?.status !== 'active') {
      throw new Error('An active account is required to create a transaction')
    }
    if (data.transaction_type !== 'transfer' && data.transfer_to_account_id !== null) {
      throw new Error('Only transfers can have a destination account')
    }
    const destination = data.transfer_to_account_id
      ? await accountsRepo.get(data.transfer_to_account_id)
      : undefined
    if (data.category_id) {
      const category = await categoriesRepo.get(data.category_id)
      if (
        !category ||
        category.transaction_type !== categoryTypeForTransaction(data.transaction_type)
      ) {
        throw new Error('The category must match the transaction type')
      }
      if (category.is_hidden)
        throw new Error('Hidden categories cannot be used for new transactions')
      if (data.transaction_type === 'transfer') {
        const error = transferCategoryAccountError(
          category.name,
          !!account,
          !!destination,
        )
        if (error) throw new Error(error)
        if (data.account_id && data.account_id === data.transfer_to_account_id) {
          throw new Error('A transfer must use different accounts')
        }
        if (data.account_id && account?.status !== 'active') {
          throw new Error('An active source account is required')
        }
        if (data.transfer_to_account_id && destination?.status !== 'active') {
          throw new Error('An active destination account is required')
        }
      }
    } else if (data.transaction_type === 'transfer') {
      throw new Error('A category is required for transfers')
    }
    return super.create(data)
  }

  /** Newest first, optionally filtered by context. */
  async listByDate(context?: Transaction['context']): Promise<Transaction[]> {
    const all = await this.list()
    return all.filter((t) => !context || t.context === context).sort(newestTransactionFirst)
  }

  async listByDateRange(startDate: string, endDate: string): Promise<Transaction[]> {
    const statuses = ['active', 'archived'] as const
    const transactions = await Promise.all(
      statuses.map((status) =>
        db.transactions
          .where('[status+transaction_date]')
          .between([status, startDate], [status, endDate], true, false)
          .reverse()
          .toArray(),
      ),
    )
    return transactions.flat().sort(newestTransactionFirst)
  }

  async hasByDateBefore(date: string): Promise<boolean> {
    const statuses = ['active', 'archived'] as const
    const older = await Promise.all(
      statuses.map((status) =>
        db.transactions
          .where('[status+transaction_date]')
          .between([status, Dexie.minKey], [status, date], true, false)
          .first(),
      ),
    )
    return older.some(Boolean)
  }
}
export const transactionsRepo = new TransactionsRepository(db.transactions)
