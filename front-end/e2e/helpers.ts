import type { Page } from '@playwright/test'

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')

/** Pretend to be signed in (against the test API, which accepts these fake tokens). */
export async function fakeSignIn(
  page: Page,
  who: { sub: string; email: string; name: string; picture?: string } = {
    sub: '1',
    email: 'me@gmail.com',
    name: 'Test User',
  },
) {
  const token = `h.${b64({ ...who, exp: Math.floor(Date.now() / 1000) + 3600 })}.s`
  await page.addInitScript((t) => localStorage.setItem('exptracker.idtoken', t), token)
}

export async function chooseOption(page: Page, label: string, option: string) {
  await page.getByLabel(label).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}

export interface StoredMealLog {
  id: string
  entry_date: string
  meal: string
  food_id: string
  food_name: string
  weight_g: number
  calories: number | null
  protein: number | null
  carbs: number | null
  fat: number | null
  calories_100g?: number | null
  protein_100g?: number | null
  carbs_100g?: number | null
  fat_100g?: number | null
  image: string | null
  version: number
  sync_state: string
  status: string
  created_at: string
  updated_at: string
}

/** Add rows directly to the Dexie meal-log store, e.g. to simulate earlier synced data. */
export async function seedMealLogs(
  page: Page,
  dbName: string,
  rows: StoredMealLog[],
): Promise<void> {
  await page.evaluate(
    ({ dbName, rows }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open(dbName)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          if (!database.objectStoreNames.contains('meal_logs')) {
            database.close()
            reject(new Error('meal_logs store is missing'))
            return
          }
          const transaction = database.transaction('meal_logs', 'readwrite')
          transaction.oncomplete = () => {
            database.close()
            resolve()
          }
          transaction.onerror = () => {
            database.close()
            reject(transaction.error)
          }
          const store = transaction.objectStore('meal_logs')
          for (const row of rows) store.put(row)
        }
      }),
    { dbName, rows },
  )
}

export async function readMealLogs(page: Page, dbName: string): Promise<StoredMealLog[]> {
  return page.evaluate(
    (name) =>
      new Promise<StoredMealLog[]>((resolve, reject) => {
        const request = indexedDB.open(name)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          if (!database.objectStoreNames.contains('meal_logs')) {
            database.close()
            resolve([])
            return
          }
          const transaction = database.transaction('meal_logs')
          const rows = transaction.objectStore('meal_logs').getAll()
          rows.onsuccess = () => {
            database.close()
            resolve(rows.result as StoredMealLog[])
          }
          rows.onerror = () => {
            database.close()
            reject(rows.error)
          }
        }
      }),
    dbName,
  )
}

/** Pick a category from the searchable Category combobox on the add-transaction page. */
export async function chooseCategory(page: Page, name: string, label = 'Category') {
  await page.getByRole('combobox', { name: label, exact: true }).click()
  await page.getByRole('option', { name, exact: true }).click()
}
