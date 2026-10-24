import { expect, test } from '@playwright/test'
import { chooseOption, fakeSignIn } from './helpers'

test('currency and transaction fields use the shared themed dropdowns', async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await fakeSignIn(page)

  await page.goto('/money/settings/accounts')
  await expect(page.getByRole('heading', { name: 'Payment Account' })).toBeVisible()
  await page.getByRole('button', { name: 'Add payment account' }).click()
  await chooseOption(page, 'Account type', 'Credit Card')
  await expect(page.getByText(/Credit Limit/)).toBeVisible()

  await page.goto('/money/settings/currency')
  await page.getByLabel('Preferred currency').click()
  await expect(page.getByRole('option', { name: /USD/ })).toBeVisible()

  await page.goto('/money/expenses/new')
  const merchant = page.getByLabel('Merchant')
  await merchant.fill('New merchant')
  await expect(merchant).toHaveAttribute('aria-expanded', 'true')
  await expect(merchant).toHaveValue('New merchant')
})
