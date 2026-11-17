import type { Budget } from '@/db/types'

/**
 * The monthly total budget is stored as a category-less Budget row with this
 * reserved name, so it syncs like any other budget without a schema change.
 */
export const TOTAL_BUDGET_NAME = 'Total monthly budget'

export function isTotalBudget(budget: Budget): boolean {
  return budget.category_id === null && budget.name === TOTAL_BUDGET_NAME
}

export function findTotalBudget(budgets: Budget[]): Budget | undefined {
  return budgets.find(isTotalBudget)
}

/** Budgets allocated to individual categories (everything except the total). */
export function categoryBudgets(budgets: Budget[]): Budget[] {
  return budgets.filter((budget) => !isTotalBudget(budget))
}

export function totalAllocated(budgets: Budget[], excludeId?: string | null): number {
  return categoryBudgets(budgets)
    .filter((budget) => budget.id !== excludeId)
    .reduce((sum, budget) => sum + budget.amount_minor, 0)
}

/** Why a category allocation cannot be saved, or null when it is allowed. */
export function allocationError(
  budgets: Budget[],
  amountMinor: number,
  excludeId?: string | null,
): string | null {
  const total = findTotalBudget(budgets)
  if (!total) return 'Set a monthly budget before allocating it to categories.'
  const allocated = totalAllocated(budgets, excludeId) + amountMinor
  if (allocated > total.amount_minor) {
    return 'Allocations exceed the monthly budget. Increase the monthly budget first.'
  }
  return null
}

/** Why the total cannot be set to this amount, or null when it is allowed. */
export function totalBudgetError(budgets: Budget[], amountMinor: number): string | null {
  if (amountMinor <= 0) return 'Enter an amount greater than zero.'
  if (amountMinor < totalAllocated(budgets)) {
    return 'The monthly budget cannot be lower than what is already allocated to categories.'
  }
  return null
}
