import { expect, test } from '@playwright/test'
import { fakeSignIn } from './helpers'

test('food home, goal, diary and insights use logged data', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const today = new Date()
  const key = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
  const user = {
    sub: '1',
    email: 'me@gmail.com',
    name: 'Test User',
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
  const entry = {
    id: 'egg',
    entry_date: key,
    meal: 'breakfast',
    food_id: 'egg',
    food_name: 'Egg',
    weight_g: 50,
    calories: 75,
    carbs: 1,
    protein: 6,
    fat: 5,
    image: null,
    version: 1,
    status: 'active',
    created_at: `${key}T08:00:00.000Z`,
    updated_at: `${key}T08:00:00.000Z`,
  }
  await page.route('**/sync/pull', (route) =>
    route.fulfill({
      json: {
        categories: [],
        accounts: [],
        merchants: [],
        transactions: [],
        budgets: [],
        due_payments: [],
        meal_logs: [entry],
        groups: [],
        invitations: [],
        server_time: new Date().toISOString(),
      },
    }),
  )
  let goal: number | null = null
  await page.route('**/food/goal', (route) => {
    if (route.request().method() === 'PUT') goal = route.request().postDataJSON().calories
    return route.fulfill({ json: { calories: goal } })
  })
  await fakeSignIn(page)
  await page.goto('/food/home')
  await expect(page.getByRole('region', { name: 'Calories today' })).toContainText('75 kcal')
  const breakfast = page.getByRole('link', { name: /breakfast.*75 kcal/i })
  const dinner = page.getByRole('link', { name: /dinner.*add/i })
  const streak = page.getByRole('link', { name: /day streak/i })
  const navigation = page.getByRole('navigation', { name: 'MyFood navigation' })
  await expect(breakfast).toHaveCSS('display', 'flex')
  await expect(streak).toHaveCSS('display', 'flex')
  await expect(navigation).toHaveCSS('background-color', 'rgb(22, 36, 31)')
  const dinnerBox = await dinner.boundingBox()
  const navigationBox = await navigation.boundingBox()
  const syncBanner = page.locator('aside[role="status"]')
  const syncBox = await syncBanner.boundingBox()
  expect(dinnerBox).not.toBeNull()
  expect(navigationBox).not.toBeNull()
  expect(dinnerBox!.y + dinnerBox!.height - (syncBox ? syncBox.height + 8 : 0)).toBeLessThanOrEqual(navigationBox!.y)
  await page.getByRole('button', { name: 'Set daily goal' }).click()
  await page.getByLabel('Daily calorie goal').fill('2000')
  await page.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('of 2,000 kcal', { exact: false })).toBeVisible()
  await page.setViewportSize({ width: 320, height: 640 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320)
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const narrowDinner = await dinner.boundingBox()
  const narrowNavigation = await navigation.boundingBox()
  expect(narrowDinner!.y + narrowDinner!.height).toBeLessThanOrEqual(narrowNavigation!.y)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('link', { name: 'Diary', exact: true }).click()
  await expect(page.getByText('Egg · 50 g')).toBeVisible()
  await page.getByRole('button', { name: 'Previous month' }).click()
  await page.getByRole('button', { name: 'Jump to today' }).click()
  await expect(page.getByText('Egg · 50 g')).toBeVisible()
  await page.getByRole('link', { name: 'Insights', exact: true }).click()
  await expect(page.getByText('Goal 2,000 kcal', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Month', exact: true }).click()
  await expect(page.getByText(/^This month ·/)).toBeVisible()
})
