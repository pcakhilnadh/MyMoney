import { CATEGORIES } from '@/lib/money'
import { db } from './db'
import { categoriesRepo } from './repos'

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
}
