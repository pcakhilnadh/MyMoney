import { budgetsRepo, categoriesRepo } from '@/db/repos'
import type { Budget, Category } from '@/db/types'
import { categoryBudgets } from '@/lib/budget'

/** The category's own monthly allocation, if it has one. */
export function findCategoryBudget(budgets: Budget[], category: Category): Budget | undefined {
  return categoryBudgets(budgets).find(
    (item) =>
      item.category_id === category.id || (!item.category_id && item.name === category.name),
  )
}

/** Hides a category and releases its share of the monthly budget. */
export async function hideCategory(category: Category, budgets: Budget[]): Promise<void> {
  const budget = findCategoryBudget(budgets, category)
  if (budget) await budgetsRepo.remove(budget.id)
  await categoriesRepo.update(category.id, { is_hidden: true })
}

export async function showCategory(category: Category): Promise<void> {
  await categoriesRepo.update(category.id, { is_hidden: false })
}
