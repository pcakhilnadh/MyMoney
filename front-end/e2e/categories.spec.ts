import { expect, test } from '@playwright/test'
import { fakeSignIn } from './helpers'

test('category types, hiding, and expense-only budgets', async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
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
  const categoryButtons = page.getByRole('group', { name: 'Category' }).getByRole('button')
  const categoryNames = await categoryButtons.allTextContents()
  expect(categoryNames).toEqual([...categoryNames].sort((a, b) => a.localeCompare(b)))
  await page.getByRole('button', { name: 'Refund' }).click()
  await expect(page.getByText('Expense category')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Food & Dining' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Shopping' })).toBeVisible()

  await page.getByRole('button', { name: 'Income' }).click()
  await expect(page.getByRole('button', { name: 'Salary' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Shopping' })).toHaveCount(0)

  await page.getByRole('button', { name: 'Transfer' }).click()
  await expect(page.getByRole('button', { name: 'Money Lent' })).toBeVisible()

  await page.goto('/settings/categories')
  await page.getByRole('button', { name: 'Add category' }).click()
  await expect(page.getByPlaceholder('New expense category')).toBeVisible()
  await page.getByPlaceholder('New expense category').fill('Test category')
  await page.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(page.getByText('Test category')).toBeVisible()

  await page.goto('/budgets')
  await page.getByRole('button', { name: 'Add budget' }).click()
  await expect(page.getByRole('button', { name: 'Food & Dining' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Shopping' })).toBeVisible()
})
