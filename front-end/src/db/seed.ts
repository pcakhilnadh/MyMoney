import { CATEGORIES } from '@/lib/money'
import { db } from './db'
import { accountsRepo, categoriesRepo, transactionsRepo } from './repos'

/** Idempotent: safe to call on every app start. */
export async function seedIfEmpty(): Promise<void> {
  if ((await db.categories.count()) === 0) {
    for (const name of CATEGORIES) {
      await categoriesRepo.create({
        name,
        icon: name.toLowerCase(),
        color: null,
        transaction_type: 'expense',
        is_system: true,
      })
    }
  }

  const oldSeedAccount = (await accountsRepo.list()).find(
    (account) =>
      account.name === 'Cash' &&
      account.account_type === 'cash' &&
      account.currency === 'INR' &&
      account.opening_balance === 0 &&
      account.credit_limit === null &&
      account.is_default,
  )
  if (
    oldSeedAccount &&
    !(await transactionsRepo.list()).some(
      (transaction) => transaction.account_id === oldSeedAccount.id,
    )
  ) {
    await accountsRepo.remove(oldSeedAccount.id)
  }
}
