import { expect, test } from '@playwright/test'
import { fakeSignIn } from './helpers'

test('credit card limit and opening balances', async ({ page }) => {
  await fakeSignIn(page, { sub: 'acc-user', email: 'acc@gmail.com', name: 'Acc User' })
  await page.goto('/settings/accounts')

  await page.getByPlaceholder('Account name').fill('HDFC Savings')
  await page.getByPlaceholder('0').first().fill('5000')
  await page.getByRole('button', { name: 'Add Account' }).click()
  await expect(page.getByText('₹5,000.00')).toBeVisible()

  await page.getByPlaceholder('Account name').fill('Visa')
  await page.getByLabel('Account type').selectOption('credit_card')
  await page.getByPlaceholder('0').nth(0).fill('1000')
  await page.getByPlaceholder('0').nth(1).fill('50000')
  await page.getByRole('button', { name: 'Add Account' }).click()
  await expect(page.getByText('₹1,000.00 used')).toBeVisible()
  await expect(page.getByText('₹49,000.00 available')).toBeVisible()
  await expect(page.getByText('limit ₹50,000.00')).toBeVisible()
})
