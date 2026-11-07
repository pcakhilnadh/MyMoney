import { expect, test } from '@playwright/test'
import { chooseOption, fakeSignIn } from './helpers'

test('credit card limit and opening balances', async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await fakeSignIn(page, { sub: 'acc-user', email: 'acc@gmail.com', name: 'Acc User' })
  await page.goto('/money/settings/accounts')

  await expect(page.getByRole('heading', { name: 'Payment Account' })).toBeVisible()
  await page.getByRole('button', { name: 'Add payment account' }).click()
  await expect(page.getByRole('button', { name: 'Back' })).toBeVisible()
  await page.getByPlaceholder('e.g., ICICI Bank').fill('HDFC Savings')
  await page.getByPlaceholder('0').first().fill('5000')
  await page.getByRole('button', { name: 'Add Account' }).click()
  await page.getByRole('button', { name: 'Show balance' }).first().click()
  await expect(page.getByText('₹5,000.00')).toBeVisible()

  await page.getByRole('button', { name: 'Add payment account' }).click()
  await page.getByPlaceholder('e.g., ICICI Bank').fill('Visa')
  await chooseOption(page, 'Account type', 'Credit Card')
  await page.getByPlaceholder('0').nth(0).fill('1000')
  await page.getByPlaceholder('0').nth(1).fill('50000')
  await page.getByRole('button', { name: 'Add Account' }).click()
  await page.getByRole('button', { name: 'Show balance' }).last().click()
  await expect(page.getByText('Amount Owed')).toBeVisible()
  await expect(page.getByText('₹1,000.00', { exact: true })).toBeVisible()
  await expect(page.getByText('Available')).toBeVisible()
  await expect(page.getByText('₹49,000.00', { exact: true })).toBeVisible()
  await expect(page.getByText('Credit Limit')).toBeVisible()
  await expect(page.getByText('₹50,000.00', { exact: true })).toBeVisible()

  await page.getByRole('heading', { name: 'Visa' }).click()
  await expect(page.getByText('Amount owed')).toBeVisible()
  await expect(page.getByText('Current balance')).not.toBeVisible()
  await expect(page.getByText('Debit')).toBeVisible()
  await expect(page.getByText('Credit', { exact: true })).toBeVisible()
  await expect(page.getByText('Transfer')).toBeVisible()

  await page.getByRole('button', { name: 'Edit Visa' }).click()
  await page.getByLabel('Account name').fill('Visa Main')
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

test('accounts can be made inactive and reactivated', async ({ page, context }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await fakeSignIn(page, { sub: 'account-status-user', email: 'status@gmail.com' })
  await page.goto('/money/settings/accounts')
  await context.setOffline(true)

  await page.getByRole('button', { name: 'Add payment account' }).click()
  await page.getByPlaceholder('e.g., ICICI Bank').fill('Travel Wallet')
  await page.getByRole('button', { name: 'Add Account' }).click()
  await page.getByRole('heading', { name: 'Travel Wallet' }).click()

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    expect(dialog.message()).toContain('history will remain')
    await dialog.accept()
  })
  await page.getByRole('button', { name: 'Make Travel Wallet inactive' }).click()
  await expect(page.getByText(/Inactive/)).toBeVisible()
  await page.getByRole('link', { name: 'Home' }).click()
  await page.getByRole('link', { name: 'Add expense' }).click()
  await expect(
    page.getByText('Add an account that supports transactions before creating a transaction.'),
  ).toBeVisible()

  await page.getByRole('link', { name: 'Settings' }).click()
  await page.getByRole('link', { name: 'Payment Account' }).click()
  await page.getByRole('heading', { name: 'Travel Wallet' }).click()
  await page.getByRole('button', { name: 'Make Travel Wallet active' }).click()
  await expect(page.getByText(/Inactive/)).not.toBeVisible()
  await page.getByRole('link', { name: 'Home' }).click()
  await page.getByRole('link', { name: 'Add expense' }).click()
  await page.getByLabel('Paid from').click()
  await expect(page.getByRole('option')).toHaveText(['Travel Wallet'])
})
