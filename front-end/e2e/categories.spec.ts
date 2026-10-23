import { expect, test } from '@playwright/test'
import { fakeSignIn } from './helpers'

test('category types, hiding, and expense-only budgets', async ({ page }) => {
  await fakeSignIn(page, {
    sub: 'category-user',
    email: 'category@gmail.com',
    name: 'Category User',
  })

  await page.goto('/settings/categories')
  await expect(page.getByText('Food & Dining')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Delete Food & Dining' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Hide Food & Dining' }).click()
  await expect(page.getByText('Default · Hidden')).toBeVisible()

  await page.goto('/expenses/new')
  await page.getByRole('button', { name: 'Refund' }).click()
  await expect(page.getByText('Expense category')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Food & Dining' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Shopping' })).toBeVisible()

  await page.getByRole('button', { name: 'Income' }).click()
  await expect(page.getByRole('button', { name: 'Salary' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Shopping' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Transfer' }).click()
  await expect(page.getByRole('button', { name: 'Money Lent' })).toBeVisible()

  await page.goto('/budgets')
  await expect(page.getByRole('button', { name: 'Food & Dining' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Shopping' })).toBeVisible()
})
