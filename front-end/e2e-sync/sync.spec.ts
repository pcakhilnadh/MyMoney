import { expect, test } from '@playwright/test'
import { fakeSignIn } from '../e2e/helpers'

const API = 'http://localhost:8001'

test('local expense reaches the server, and a fresh device pulls it back', async ({
  page,
  browser,
}) => {
  await fakeSignIn(page)
  await page.goto('/home')
  // signing in registers the profile; sync pushes seed data and later the expense
  await page.getByRole('link', { name: 'Add expense' }).click()
  await page.getByPlaceholder('0').fill('120')
  await page.getByPlaceholder('Description').fill('Synced coffee')
  await page.getByRole('button', { name: 'Food' }).click()
  await page.getByRole('button', { name: 'Save Expense' }).click()
  await expect(page.getByText('Synced coffee')).toBeVisible()

  await page.goto('/settings')
  await expect(page.getByTestId('sync-state')).toHaveText('Up to date', { timeout: 15_000 })
  await expect(page.getByText('0 pending')).toBeVisible()

  // server has it
  const token = await page.evaluate(() => localStorage.getItem('exptracker.idtoken'))
  const rows = await (
    await page.request.get(`${API}/transactions`, { headers: { Authorization: `Bearer ${token}` } })
  ).json()
  expect(rows.map((r: { description: string }) => r.description)).toContain('Synced coffee')

  // a brand-new browser profile (empty local DB) pulls it down
  const ctx2 = await browser.newContext()
  const page2 = await ctx2.newPage()
  await page2.addInitScript((t) => localStorage.setItem('exptracker.idtoken', t!), token)
  await page2.goto('/transactions')
  await expect(page2.getByText('Synced coffee')).toBeVisible({ timeout: 15_000 })

  // delete on device 2 propagates back to device 1
  await page2.getByRole('button', { name: 'Delete Synced coffee' }).click()
  await page.goto('/settings')
  await page.getByRole('button', { name: 'Sync now' }).click()
  await page.goto('/transactions')
  await expect(page.getByText('Synced coffee')).toHaveCount(0, { timeout: 15_000 })
})
