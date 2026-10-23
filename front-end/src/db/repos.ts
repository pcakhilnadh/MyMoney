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
    const normalized = name.trim()
    if (!normalized) return
    const existing = (await this.list()).find(
      (merchant) => merchant.name.toLocaleLowerCase() === normalized.toLocaleLowerCase(),
    )
    if (!existing) await this.create({ name: normalized })
  }
}

export const merchantsRepo = new MerchantsRepository(db.merchants)

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
    return all
      .filter((t) => !context || t.context === context)
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
  }
}
export const transactionsRepo = new TransactionsRepository(db.transactions)
