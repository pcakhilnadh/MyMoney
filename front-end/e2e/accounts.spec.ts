import { expect, test } from '@playwright/test'
import { fakeSignIn } from './helpers'

test('credit card limit and opening balances', async ({ page }) => {
  await fakeSignIn(page, { sub: 'acc-user', email: 'acc@gmail.com', name: 'Acc User' })
  await page.goto('/settings/accounts')

  await expect(page.getByRole('heading', { name: 'Payment Account' })).toBeVisible()
  await page.getByRole('button', { name: 'Add payment account' }).click()
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()
  await page.getByPlaceholder('Account name').fill('HDFC Savings')
  await page.getByPlaceholder('0').first().fill('5000')
  await page.getByRole('button', { name: 'Add Account' }).click()
  await expect(page.getByText('₹5,000.00')).toBeVisible()

  await page.getByRole('button', { name: 'Add payment account' }).click()
  await page.getByPlaceholder('Account name').fill('Visa')
  await page.getByLabel('Account type').selectOption('credit_card')
  await page.getByPlaceholder('0').nth(0).fill('1000')
  await page.getByPlaceholder('0').nth(1).fill('50000')
  await page.getByRole('button', { name: 'Add Account' }).click()
  await expect(page.getByText('₹1,000.00 owed')).toBeVisible()
  await expect(page.getByText('₹49,000.00 available')).toBeVisible()
  await expect(page.getByText('limit ₹50,000.00')).toBeVisible()

  await page.getByRole('link', { name: /Visa/ }).click()
  await expect(page.getByText('Amount owed')).toBeVisible()
  await expect(page.getByText('Current balance')).not.toBeVisible()
  await expect(page.getByText('Debit')).toBeVisible()
  await expect(page.getByText('Credit', { exact: true })).toBeVisible()
  await expect(page.getByText('Transfer')).toBeVisible()

  await page.getByRole('link', { name: '← Payment Account' }).click()
  await page.getByRole('button', { name: 'Edit Visa' }).click()
  await page.getByPlaceholder('Account name').fill('Visa Main')
  await page.getByRole('button', { name: 'Save Account' }).click()
  await expect(page.getByText('Visa Main')).toBeVisible()
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    expect(dialog.message()).toContain('Visa Main')
    await dialog.accept()
  })
  await page.getByRole('button', { name: 'Delete Visa Main' }).click()
  await expect(page.getByText('Visa Main')).not.toBeVisible()
})
