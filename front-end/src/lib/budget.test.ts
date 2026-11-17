import { describe, expect, it } from 'vitest'
import type { Budget } from '@/db/types'
import {
  TOTAL_BUDGET_NAME,
  allocationError,
  categoryBudgets,
  findTotalBudget,
  totalAllocated,
  totalBudgetError,
} from './budget'

function budget(id: string, amount: number, categoryId: string | null, name: string): Budget {
  return {
    id,
    group_id: null,
    category_id: categoryId,
    name,
    amount_minor: amount,
    currency: 'INR',
    period: 'monthly',
    period_start: '2026-11-01',
    period_end: null,
    alert_threshold_percent: 80,
    is_active: true,
    version: 1,
    sync_state: 'pending',
    status: 'active',
    created_at: '',
    updated_at: '',
  } as Budget
}

const total = (amount: number) => budget('t', amount, null, TOTAL_BUDGET_NAME)

describe('monthly budget allocation rules', () => {
  it('blocks category allocation until a monthly budget exists', () => {
    expect(allocationError([], 100)).toMatch(/Set a monthly budget/)
  })

  it('allows allocations within the monthly budget and blocks excess', () => {
    const budgets = [total(1000), budget('a', 600, 'c1', 'Food')]
    expect(allocationError(budgets, 400)).toBeNull()
    expect(allocationError(budgets, 401)).toMatch(/exceed/)
  })

  it('ignores the edited budget when re-checking its own amount', () => {
    const budgets = [total(1000), budget('a', 600, 'c1', 'Food')]
    expect(allocationError(budgets, 1000, 'a')).toBeNull()
    expect(allocationError(budgets, 1001, 'a')).toMatch(/exceed/)
  })

  it('does not count the total as an allocation', () => {
    const budgets = [total(1000), budget('a', 300, 'c1', 'Food')]
    expect(findTotalBudget(budgets)?.id).toBe('t')
    expect(categoryBudgets(budgets).map((b) => b.id)).toEqual(['a'])
    expect(totalAllocated(budgets)).toBe(300)
  })

  it('stops the monthly budget dropping below existing allocations', () => {
    const budgets = [total(1000), budget('a', 600, 'c1', 'Food')]
    expect(totalBudgetError(budgets, 599)).toMatch(/cannot be lower/)
    expect(totalBudgetError(budgets, 600)).toBeNull()
    expect(totalBudgetError(budgets, 0)).toMatch(/greater than zero/)
  })
})
