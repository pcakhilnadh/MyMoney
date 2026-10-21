import { CATEGORIES } from '@/lib/money'
import { db } from './db'
import { accountsRepo, categoriesRepo } from './repos'

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
  if ((await db.accounts.count()) === 0) {
    await accountsRepo.create({
      name: 'Cash',
      account_type: 'cash',
      currency: 'INR',
      opening_balance: 0,
      credit_limit: null,
      is_default: true,
    })
  }
}
