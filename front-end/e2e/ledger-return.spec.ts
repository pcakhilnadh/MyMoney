import { expect, test, type Page } from '@playwright/test'
import { fakeSignIn } from './helpers'

/** Adds `count` expenses straight to the local ledger, one per hour, in `month` (YYYY-MM). */
async function seedLedger(page: Page, month: string, count: number) {
  await page.evaluate(
    ({ month, count }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('exptracker-1')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction(['accounts', 'transactions'], 'readwrite')
          const now = new Date().toISOString()
          const base = {
            version: 1,
            sync_state: 'synced',
            status: 'active',
            created_at: now,
            updated_at: now,
          }
          tx.objectStore('accounts').put({
            ...base,
            id: 'acc-ledger',
            name: 'Ledger test',
            account_type: 'cash',
            currency: 'INR',
            opening_balance: 0,
            credit_limit: null,
            is_default: false,
          })
          for (let i = 0; i < count; i += 1) {
            const day = String(1 + Math.floor(i / 2)).padStart(2, '0')
            tx.objectStore('transactions').put({
              ...base,
              id: `tx-${i}`,
              account_id: 'acc-ledger',
              transfer_to_account_id: null,
              category_id: null,
              group_id: null,
              context: 'personal',
              transaction_type: 'expense',
              title: `Purchase ${i + 1}`,
              long_description: null,
              merchant: null,
              amount_minor: 1000 + i,
              currency: 'INR',
              transaction_date: `${month}-${day}T${String(8 + (i % 2) * 4).padStart(2, '0')}:00:00.000Z`,
              notes: null,
              is_shared: false,
              split_method: null,
            })
          }
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    { month, count },
  )
}

const previousMonth = () => {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

test('back from a transaction returns to its month and row, not the top of this month', async ({
  page,
}) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await page.setViewportSize({ width: 390, height: 844 })
  await fakeSignIn(page)
  await page.goto('/money/transactions')
  const month = previousMonth()
  await seedLedger(page, month, 40)

  await page.getByRole('button', { name: 'Previous month' }).click()
  await expect(page).toHaveURL(new RegExp(`month=${month}`))
  // A row far down the list.
  const row = page.getByRole('button', { name: /Purchase 7,/ })
  await row.scrollIntoViewIfNeeded()
  await row.click()
  await expect(page).toHaveURL(/\/money\/transactions\/tx-6$/)

  // The back link keeps the month and brings the row back into view.
  await page.getByRole('link', { name: '← Transactions' }).click()
  await expect(page).toHaveURL(new RegExp(`/money/transactions\\?month=${month}$`))
  await expect(row).toBeInViewport()
  await expect(row).toBeFocused()

  // The browser's back button does the same.
  await row.click()
  await page.goBack()
  await expect(page).toHaveURL(new RegExp(`month=${month}`))
  await expect(row).toBeInViewport()
})

test('Set budget opens the budget view when no monthly budget is set', async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await fakeSignIn(page)
  await page.goto('/money/home')
  await page.getByRole('link', { name: 'Set budget' }).click()
  await expect(page).toHaveURL(/\/money\/budgets\?view=budget$/)
})
