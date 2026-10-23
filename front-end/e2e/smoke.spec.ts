import { expect, test } from '@playwright/test'
import { fakeSignIn } from './helpers'

test('signed-out users are sent to login', async ({ page }) => {
  await page.goto('/home')
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByText('Track expenses together')).toBeVisible()
})

test('signed-in shell shows tabs and settings', async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await fakeSignIn(page)
  await page.goto('/home')
  const appSelector = page.getByRole('group', { name: 'App selector' })
  await expect(appSelector.getByRole('button', { name: 'My Money' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await expect(appSelector.getByRole('button', { name: 'MyFood' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(appSelector.getByRole('button', { name: 'MyHabbit' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(page.locator('[data-app="money"]')).toHaveCSS('--primary', '#4b8bff')
  await expect(page.locator('[data-app="money"]')).toHaveCSS('background-image', /50vh/)
  const monthlySpendCard = page.locator('.hero')
  await expect(monthlySpendCard).toHaveText(/Spent this month/)
  await expect(monthlySpendCard).toHaveCSS('background-image', /color\(srgb/)
  await expect(page.locator('.recharts-responsive-container svg').first()).toBeVisible()
  await expect(page.locator('.recharts-responsive-container svg stop').first()).toHaveCSS(
    'stop-color',
    'rgb(75, 139, 255)',
  )
  await expect(page.getByRole('link', { name: 'Home' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('link', { name: 'Home' })).toHaveCSS('color', 'rgb(75, 139, 255)')
  await expect(page.getByRole('navigation').locator('svg').first()).toHaveCSS(
    'color',
    'rgb(75, 139, 255)',
  )
  await page.getByRole('link', { name: 'Transactions' }).click()
  await expect(page.getByRole('link', { name: 'Transactions' })).toHaveAttribute(
    'aria-current',
    'page',
  )
  await expect(page.getByRole('link', { name: 'Transactions' })).toHaveCSS(
    'color',
    'rgb(75, 139, 255)',
  )
  await page.goto('/home')
  await appSelector.getByRole('button', { name: 'MyFood' }).click()
  await expect(page.getByRole('heading', { name: 'MyFood' })).toBeVisible()
  await expect(page.getByText('Coming Soon')).toBeVisible()
  await expect(page.locator('[data-app="food"]')).toHaveCSS('background-image', /50vh/)
  await expect(
    page.getByRole('navigation', { name: 'MyFood navigation' }).locator('svg').first(),
  ).toHaveCSS('color', 'rgb(57, 201, 138)')
  await expect(
    page.getByRole('navigation', { name: 'MyFood navigation' }).getByText('Home'),
  ).toHaveCSS('color', 'rgb(57, 201, 138)')
  await expect(
    page.getByRole('navigation', { name: 'MyFood navigation' }).getByText('Home'),
  ).toBeDisabled()
  await expect(page.locator('[data-app="food"]')).toHaveCSS('--primary', '#39c98a')
  await page.reload()
  await expect(appSelector.getByRole('button', { name: 'My Money' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await appSelector.getByRole('button', { name: 'MyHabbit' }).click()
  await expect(page.getByRole('heading', { name: 'MyHabbit' })).toBeVisible()
  await expect(page.locator('[data-app="habit"]')).toHaveCSS('background-image', /50vh/)
  await expect(
    page.getByRole('navigation', { name: 'MyHabbit navigation' }).locator('svg').first(),
  ).toHaveCSS('color', 'rgb(237, 41, 57)')
  await expect(
    page.getByRole('navigation', { name: 'MyHabbit navigation' }).getByText('Habits'),
  ).toHaveCSS('color', 'rgb(237, 41, 57)')
  await expect(
    page.getByRole('navigation', { name: 'MyHabbit navigation' }).getByText('Habits'),
  ).toBeDisabled()
  await expect(page.locator('[data-app="habit"]')).toHaveCSS('--primary', '#ed2939')
  await appSelector.getByRole('button', { name: 'My Money' }).click()
  await page.getByRole('link', { name: 'View budgets' }).click()
  await expect(page).toHaveURL(/\/budgets/)
  await expect(page.getByRole('heading', { name: 'Budgets' })).toBeVisible()
  await page.goto('/home')
  await expect(page.getByRole('link', { name: 'Transactions' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Insights' })).toHaveCount(0)
  const personalLink = appSelector.getByRole('link', { name: 'Personal' })
  await personalLink.click()
  await expect(page).toHaveURL(/\/personal/)
  await expect(appSelector.getByRole('button', { name: 'My Money' })).toHaveAttribute(
    'aria-pressed',
    'false',
  )
  await expect(personalLink).toHaveCSS('color', 'rgb(142, 142, 160)')
  await expect(page.locator('.bottom-nav')).toHaveCount(0)
  await expect(page.getByText('Test User')).toBeVisible()
  await expect(page.getByTestId('sync-state')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'My Money Settings' })).toHaveCount(0)
  await appSelector.getByRole('button', { name: 'My Money' }).click()
  await expect(page).toHaveURL(/\/home/)
  await expect(page.getByText('Test User')).toHaveCount(0)
  await expect(page.locator('.hero')).toHaveText(/Spent this month/)
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/settings/)
  await expect(page.getByRole('heading', { name: 'My Money Settings' })).toHaveCount(1)
  await expect(page.getByRole('link', { name: 'Payment Account' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Categories' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Budgets' })).toBeVisible()
  await page.getByRole('link', { name: 'Payment Account' }).click()
  await expect(page.getByRole('heading', { name: 'Payment Account' })).toBeVisible()
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page.getByRole('heading', { name: 'My Money Settings' })).toHaveCount(1)
  await appSelector.getByRole('link', { name: 'Personal' }).click()
  await page.getByRole('button', { name: 'Sign out' }).click()
  await expect(page).toHaveURL(/\/login/)
})
