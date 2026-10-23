import { db } from './db'
import { Repository } from './repository'
import type { Account, Budget, Category, Transaction } from './types'

export const accountsRepo = new Repository<Account>(db.accounts)
export const categoriesRepo = new Repository<Category>(db.categories)
export const budgetsRepo = new Repository<Budget>(db.budgets)

class TransactionsRepository extends Repository<Transaction> {
  async create(data: Omit<Transaction, 'id' | 'version' | 'sync_state' | 'status' | 'created_at' | 'updated_at'>): Promise<Transaction> {
    if (!data.account_id || !(await accountsRepo.get(data.account_id))) {
      throw new Error('An active account is required to create a transaction')
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
