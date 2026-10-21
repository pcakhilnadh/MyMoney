import { expect, test } from '@playwright/test'
import { fakeSignIn } from './helpers'

test('signed-out users are sent to login', async ({ page }) => {
  await page.goto('/home')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByText('Track expenses together')).toBeVisible()
})

test('signed-in shell shows tabs and settings', async ({ page }) => {
  await fakeSignIn(page)
  await page.goto('/home')
  await expect(page.getByRole('link', { name: 'Transactions' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Insights' })).toHaveCount(0)
  await page.getByRole('link', { name: 'Personal' }).click()
  await expect(page.getByText('Test User')).toBeVisible()
  await page.getByRole('link', { name: 'Accounts and payment methods' }).click()
  await expect(page.getByRole('heading', { name: 'Accounts' })).toBeVisible()
  await page.getByRole('link', { name: 'Personal' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
})
