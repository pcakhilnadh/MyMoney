import { DEFAULT_CATEGORIES, LEGACY_EXPENSE_CATEGORY_NAMES } from '@/lib/money'
import { accountsRepo, categoriesRepo, transactionsRepo } from './repos'

/** Idempotent: safe to call on every app start. */
export async function seedIfEmpty(): Promise<void> {
  const categories = await categoriesRepo.list()
  for (const category of categories) {
    const migratedName =
      category.is_system && category.transaction_type === 'expense'
        ? LEGACY_EXPENSE_CATEGORY_NAMES[category.name]
        : undefined
    if (migratedName) {
      await categoriesRepo.update(category.id, { name: migratedName })
    }
  }

  const existing = await categoriesRepo.list()
  for (const transaction_type of ['expense', 'income', 'transfer'] as const) {
    for (const name of DEFAULT_CATEGORIES[transaction_type]) {
      if (
        existing.some(
          (category) =>
            category.name === name &&
            category.transaction_type === transaction_type &&
            category.is_system,
        )
      ) {
        continue
      }
      await categoriesRepo.create({
        name,
        icon: name.toLowerCase(),
        color: null,
        transaction_type,
        is_system: true,
        is_hidden: false,
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
