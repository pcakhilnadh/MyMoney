import { db } from './db'
import { Repository } from './repository'
import type { Account, Budget, Category, Transaction } from './types'

export const accountsRepo = new Repository<Account>(db.accounts)
export const categoriesRepo = new Repository<Category>(db.categories)
export const budgetsRepo = new Repository<Budget>(db.budgets)

class TransactionsRepository extends Repository<Transaction> {
  /** Newest first, optionally filtered by context. */
  async listByDate(context?: Transaction['context']): Promise<Transaction[]> {
    const all = await this.list()
    return all
      .filter((t) => !context || t.context === context)
      .sort((a, b) => b.transaction_date.localeCompare(a.transaction_date))
  }
}
export const transactionsRepo = new TransactionsRepository(db.transactions)
