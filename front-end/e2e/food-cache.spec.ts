import { expect, test } from '@playwright/test'
import { fakeSignIn, readMealLogs, seedMealLogs, type StoredMealLog } from './helpers'

const today = () => {
  const date = new Date()
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

const egg = (overrides: Partial<StoredMealLog> = {}): StoredMealLog => ({
  id: 'egg',
  entry_date: today(),
  meal: 'breakfast',
  food_id: 'egg',
  food_name: 'Egg',
  weight_g: 50,
  calories: 75,
  protein: 6,
  carbs: 1,
  fat: 5,
  image: null,
  version: 1,
  sync_state: 'synced',
  status: 'active',
  created_at: `${today()}T08:00:00.000Z`,
  updated_at: `${today()}T08:00:00.000Z`,
  ...overrides,
})

test('meal logs load from IndexedDB on navigation and reload while the API is slow', async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  let goalUnavailable = false
  await page.route('**/food/goal', (route) =>
    goalUnavailable
      ? route.fulfill({ status: 503, json: { detail: 'Unavailable' } })
      : route.fulfill({ json: { calories: 2000 } }),
  )
  await fakeSignIn(page)
  await page.goto('/food/home')
  await expect(page.getByRole('region', { name: 'Calories today' })).toBeVisible()
  await seedMealLogs(page, 'exptracker-1', [egg()])
  await page.reload()

  await expect(page.getByRole('region', { name: 'Calories today' })).toContainText('75 kcal')
  await expect(page.getByText('Loading food diary…')).toHaveCount(0)

  goalUnavailable = true
  await page.getByRole('link', { name: 'Diary', exact: true }).click()
  await expect(page.getByText('Egg · 50 g')).toBeVisible()
  await page.getByRole('link', { name: 'Insights', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible({ timeout: 3000 })
  await expect(page.getByText(/Unable to refresh your food diary/)).toBeVisible()
  await page.getByRole('link', { name: 'Home', exact: true }).click()
  await expect(page.getByRole('region', { name: 'Calories today' })).toContainText('75 kcal')
})

test('goal refresh reports a timeout instead of loading forever', async ({ page }) => {
  const user = {
    sub: 'food-timeout',
    email: 'food-timeout@example.test',
    name: 'Test',
    exp: Math.floor(Date.now() / 1000) + 3600,
  }
  await page.route('**/auth/refresh', (route) =>
    route.fulfill({ json: { access_token: 'test-token', token_type: 'bearer', user } }),
  )
  await page.route('**/auth/login', (route) => route.abort())
  await page.route('**/auth/me', (route) => route.fulfill({ json: {} }))
  await page.route('**/sync/push', (route) =>
    route.fulfill({ json: { accepted: [], conflicts: [] } }),
  )
  await page.route('**/sync/pull', (route) =>
    route.fulfill({
      json: {
        categories: [],
        accounts: [],
        merchants: [],
        transactions: [],
        budgets: [],
        due_payments: [],
        meal_logs: [],
        groups: [],
        invitations: [],
        server_time: new Date().toISOString(),
      },
    }),
  )
  await page.route('**/food/goal', () => new Promise(() => {}))
  await fakeSignIn(page, { sub: 'food-timeout', email: 'food-timeout@example.test', name: 'Test' })
  await page.goto('/food/home')
  await expect(page.getByText(/Unable to refresh your food diary/)).toBeVisible({ timeout: 15000 })
  await expect(page.getByRole('button', { name: 'Try again' })).toBeVisible()
})

test('saved meals and goals land in IndexedDB before the refresh', async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await page.route('**/food/catalog?*', (route) =>
    route.fulfill({
      json: [
        {
          id: 'egg',
          name: 'Egg',
          calories_100g: 150,
          protein_100g: 12,
          carbs_100g: 1,
          fat_100g: 10,
        },
      ],
    }),
  )
  let goal = 2000
  await page.route('**/food/goal', (route) => {
    if (route.request().method() === 'PUT') goal = route.request().postDataJSON().calories
    return route.fulfill({ json: { calories: goal } })
  })
  await fakeSignIn(page, {
    sub: 'food-cache-save',
    email: 'food-save@example.test',
    name: 'Test',
  })
  await page.goto('/food/home')
  await expect(page.getByText('of 2,000 kcal', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Edit daily goal' }).click()
  await page.getByRole('spinbutton', { name: 'Daily calorie goal' }).fill('1800')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('of 1,800 kcal', { exact: false })).toBeVisible()
  await page.getByRole('link', { name: 'Add meal' }).click()
  await page.getByRole('searchbox', { name: 'Search foods' }).fill('egg')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('button', { name: 'Egg', exact: true }).click()
  await page.getByRole('button', { name: 'Save meal · 1 item' }).click()
  await expect(page.getByText('Egg · 100 g')).toBeVisible()

  await expect
    .poll(async () => {
      const rows = await readMealLogs(page, 'exptracker-food-cache-save')
      return rows.map((row) => ({
        entry_date: row.entry_date,
        meal: row.meal,
        food_id: row.food_id,
        weight_g: row.weight_g,
        calories: row.calories,
        protein: row.protein,
        carbs: row.carbs,
        fat: row.fat,
        image: row.image,
        sync_state: row.sync_state,
      }))
    })
    .toContainEqual({
      entry_date: today(),
      meal: 'breakfast',
      food_id: 'egg',
      weight_g: 100,
      calories: 150,
      protein: 12,
      carbs: 1,
      fat: 10,
      image: null,
      sync_state: 'pending',
    })

  await page.reload()
  await expect(page.getByText('Egg · 100 g')).toBeVisible({ timeout: 3000 })
  await expect(page.getByText('of 1,800 kcal', { exact: false })).toBeVisible()
})

test('saving a goal cancels an older goal refresh', async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await page.route('**/food/goal', (route) => {
    if (route.request().method() === 'PUT') {
      return route.fulfill({ json: { calories: 1800 } })
    }
    return new Promise(() => {})
  })
  await fakeSignIn(page, { sub: 'goal-race', email: 'goal-race@example.test', name: 'Test' })
  const refresh = page.waitForRequest(
    (request) => request.url().endsWith('/food/goal') && request.method() === 'GET',
  )
  await page.goto('/food/home')
  await refresh
  await page.getByRole('button', { name: 'Set daily goal' }).click()
  await page.getByRole('spinbutton', { name: 'Daily calorie goal' }).fill('1800')
  const aborted = page.waitForEvent(
    'requestfailed',
    (request) => request.url().endsWith('/food/goal') && request.method() === 'GET',
  )
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await aborted
  await expect(page.getByText('of 1,800 kcal', { exact: false })).toBeVisible()
})
