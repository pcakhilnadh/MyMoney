import { expect, test } from '@playwright/test'
import { fakeSignIn } from './helpers'

const CATEGORIES = ['Bills & Utilities', 'Transportation', 'Shopping', 'Food & Dining', 'Health']

test('the Budgets card lists every category spent in without a budget', async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await fakeSignIn(page)
  await page.goto('/money/home')
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`

  // Spending this month in five categories, none of them budgeted.
  await page.evaluate(
    ({ month, names }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('exptracker-1')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const tx = db.transaction(['accounts', 'categories', 'transactions'], 'readwrite')
          const stamp = new Date().toISOString()
          const base = {
            version: 1,
            sync_state: 'synced',
            status: 'active',
            created_at: stamp,
            updated_at: stamp,
          }
          tx.objectStore('accounts').put({
            ...base,
            id: 'acc-card',
            name: 'Card test',
            account_type: 'cash',
            currency: 'INR',
            opening_balance: 0,
            credit_limit: null,
            is_default: false,
          })
          names.forEach((name, i) => {
            tx.objectStore('categories').put({
              ...base,
              id: `cat-card-${i}`,
              name: `${name} (test)`,
              icon: 'tag',
              color: null,
              transaction_type: 'expense',
              is_system: false,
              is_hidden: false,
            })
            tx.objectStore('transactions').put({
              ...base,
              id: `tx-card-${i}`,
              account_id: 'acc-card',
              transfer_to_account_id: null,
              category_id: `cat-card-${i}`,
              group_id: null,
              context: 'personal',
              transaction_type: 'expense',
              title: `${name} spend`,
              long_description: null,
              merchant: null,
              amount_minor: (5 - i) * 100000,
              currency: 'INR',
              transaction_date: `${month}-01T09:00:00.000Z`,
              notes: null,
              is_shared: false,
              split_method: null,
            })
          })
          tx.oncomplete = () => {
            db.close()
            resolve()
          }
          tx.onerror = () => reject(tx.error)
        }
      }),
    { month, names: CATEGORIES },
  )

  // Written behind the app's back, so reload to read it.
  await page.reload()
  const card = page.getByRole('link', { name: 'Open budget breakdown' })
  for (const name of CATEGORIES)
    await expect(card.getByRole('group', { name: `${name} (test), no budget` })).toBeVisible()
})
