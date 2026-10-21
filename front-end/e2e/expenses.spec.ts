import { expect, test } from '@playwright/test'
import { fakeSignIn } from './helpers'

test('add, list, budget, delete — works offline', async ({ page, context }) => {
  await fakeSignIn(page)
  await page.goto('/home')
  await expect(page.getByText('Spent this month')).toBeVisible()
  await context.setOffline(true) // local-first: no network needed from here

  await page.getByRole('link', { name: 'Add expense' }).click()
  await page.getByPlaceholder('0').fill('250.50')
  await page.getByPlaceholder('Description').fill('Lunch')
  await page.getByRole('button', { name: 'Food' }).click()
  await page.getByRole('button', { name: 'Save Expense' }).click()

  await expect(page).toHaveURL(/\/transactions/)
  await expect(page.getByText('Lunch')).toBeVisible()
  await expect(page.getByText('₹250.50')).toBeVisible()
  await page.getByPlaceholder('Search transactions or merchants').fill('zzz')
  await expect(page.getByText('No transactions yet')).toBeVisible()
  await page.getByPlaceholder('Search transactions or merchants').fill('lun')
  await expect(page.getByText('Lunch')).toBeVisible()

  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.getByText('₹250.50').first()).toBeVisible()

  await page.getByRole('link', { name: 'Budgets' }).click()
  await page.getByPlaceholder('0').fill('1000')
  await page.getByRole('button', { name: 'Food' }).click()
  await page.getByRole('button', { name: 'Add Budget' }).click()
  await expect(page.getByText('₹250.50 of ₹1,000.00')).toBeVisible()
  await expect(page.getByText('25%')).toBeVisible()

  await page.getByRole('button', { name: 'Edit Food' }).click()
  await page.getByPlaceholder('0').fill('2000')
  await page.getByRole('button', { name: 'Save Budget' }).click()
  await expect(page.getByText('₹250.50 of ₹2,000.00')).toBeVisible()
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    expect(dialog.message()).toContain('Food')
    await dialog.accept()
  })
  await page.getByRole('button', { name: 'Delete Food' }).click()
  await expect(page.getByText('₹250.50 of ₹2,000.00')).not.toBeVisible()

  await page.getByRole('link', { name: 'Personal' }).click()
  await page.getByRole('link', { name: 'Accounts and payment methods' }).click()
  await page.getByRole('link', { name: /Cash/ }).click()
  await expect(page.getByText('Lunch')).toBeVisible()
  await expect(page.getByText('Debit', { exact: true })).toBeVisible()
  await expect(page.getByText('₹250.50').first()).toBeVisible()

  await page.getByRole('link', { name: 'Transactions' }).click()
  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    expect(dialog.message()).toContain('Lunch')
    await dialog.accept()
  })
  await page.getByRole('button', { name: 'Delete Lunch' }).click()
  await expect(page.getByText('No transactions yet')).toBeVisible()
})
