import Dexie from 'dexie'
import { db } from './db'
import { Repository } from './repository'
import type { Account, Budget, Category, Merchant, Transaction } from './types'
import {
  categoryTypeForTransaction,
  transferCategoryAccountError,
} from '@/lib/transaction-categories'

export const accountsRepo = new Repository<Account>(db.accounts)
export const categoriesRepo = new Repository<Category>(db.categories)
export const budgetsRepo = new Repository<Budget>(db.budgets)

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
    b.transaction_date.localeCompare(a.transaction_date) ||
    b.updated_at.localeCompare(a.updated_at) ||
    b.created_at.localeCompare(a.created_at) ||
    b.id.localeCompare(a.id)
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
    if (account?.status !== 'active') {
      throw new Error('An active account is required to create a transaction')
    }
    if (
      data.transaction_type === 'transfer' &&
      (!data.transfer_to_account_id ||
        data.transfer_to_account_id === data.account_id ||
        !(await accountsRepo.get(data.transfer_to_account_id)))
    ) {
      throw new Error('A different destination account is required for a transfer')
    }
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
        if (!data.transfer_to_account_id || !account) {
          throw new Error('A transfer category and two accounts are required')
        }
        const destination = await accountsRepo.get(data.transfer_to_account_id)
        if (!destination) throw new Error('An active destination account is required')
        const error = transferCategoryAccountError(
          category.name,
          account.account_type,
          destination.account_type,
        )
        if (error) throw new Error(error)
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
