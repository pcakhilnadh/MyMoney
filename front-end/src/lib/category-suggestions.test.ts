import { describe, expect, it } from 'vitest'
import { suggestCategory } from './category-suggestions'
import { DEFAULT_CATEGORIES } from './money'

const expenseCategories = DEFAULT_CATEGORIES.expense
const incomeCategories = DEFAULT_CATEGORIES.income

describe('suggestCategory', () => {
  it.each([
    ['Lunch with the team', 'Food & Dining'],
    ['Dinner at Cafe Coffee Day', 'Food & Dining'],
    ['Swiggy order', 'Food & Dining'],
    ['DINNER @ Cafe!', 'Food & Dining'],
    ['Uber ride to office', 'Transportation'],
    ['Petrol top-up', 'Transportation'],
    ['Electricity bill', 'Bills & Utilities'],
    ['Mobile recharge', 'Bills & Utilities'],
    ['Netflix subscription', 'Subscriptions'],
    ['Flight to Delhi', 'Travel & Trips'],
    ['Doctor visit', 'Health & Wellness'],
    ['EMI payment', 'Loans & EMIs'],
    ['Birthday gift', 'Donations & Gifts'],
    ['College fee', 'Education & Development'],
    ['Weekly groceries from the store', 'Shopping'],
  ])('suggests a category for "%s"', (title, expected) => {
    expect(suggestCategory(title, expenseCategories)).toBe(expected)
  })

  it.each([
    ['Payday', 'Salary'],
    ['Freelance invoice', 'Business Income'],
    ['Monthly rent received', 'Rental Income'],
    ['FD interest', 'Profits & Interests'],
    ['Cashback from Amazon', 'Refund & Reimbursements'],
  ])('suggests an income category for "%s"', (title, expected) => {
    expect(suggestCategory(title, incomeCategories)).toBe(expected)
  })

  it('matches a user-created category by its own name', () => {
    expect(suggestCategory('Pet supplies run', [...expenseCategories, 'Pet Supplies'])).toBe(
      'Pet Supplies',
    )
  })

  it('only returns categories the user can actually pick', () => {
    expect(suggestCategory('Lunch with the team', ['Shopping'])).toBeNull()
    expect(suggestCategory('Lunch with the team', [])).toBeNull()
  })

  it('returns null when nothing matches', () => {
    expect(suggestCategory('Blah blah', expenseCategories)).toBeNull()
    expect(suggestCategory('   ', expenseCategories)).toBeNull()
    // The generic fallback category is never guessed on its own.
    expect(suggestCategory('Other stuff', incomeCategories)).toBeNull()
  })

  it('matches whole words only', () => {
    expect(suggestCategory('Team meeting', expenseCategories)).toBeNull()
  })
})
