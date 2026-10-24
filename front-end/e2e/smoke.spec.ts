import { expect, test } from '@playwright/test'
import { fakeSignIn } from './helpers'

test('signed-out users are sent to login', async ({ page }) => {
  await page.goto('/money/home')
  await expect(page).toHaveURL(/\/login/)
  await expect(page).toHaveTitle('MyTracker')
  await expect(page.getByText('MyTracker')).toBeVisible()
  await expect(page.getByRole('heading', { name: /Manage your money/ })).toBeVisible()
  await expect(page.locator('h1 span')).toHaveCSS('background-image', /rgb\(124, 108, 255\)/)
  await expect(page.locator('.gloss svg')).toBeVisible()
})

test('signed-in shell shows tabs and settings', async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await fakeSignIn(page)
  await page.goto('/')
  await expect(page).toHaveURL(/\/personal/)
  await expect(page.getByRole('heading', { name: 'Test!' })).toBeVisible()
  await page.goto('/money')
  await expect(page).toHaveURL(/\/money\/home/)
  await expect(page.getByText(/Good (morning|afternoon|evening)/)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Test!' })).toHaveCount(0)
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
  await expect(page.locator('html')).toHaveCSS('scrollbar-width', 'none')
  const spendingOverview = page.getByRole('region', { name: 'Spending overview' })
  await expect(spendingOverview).toContainText('Spent today')
  await expect(spendingOverview).toContainText('Spent this month')
  await expect(spendingOverview.locator('.money')).toHaveCount(2)
  await expect(spendingOverview.locator('.rounded-2xl')).toHaveCount(0)
  await expect(spendingOverview).toHaveCSS('background-image', /color\(srgb/)
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
  await page.goto('/money/transactions')
  await appSelector.getByRole('button', { name: 'MyFood' }).click()
  await expect(page).toHaveURL(/\/food\/home$/)
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
  ).toBeVisible()
  await expect(
    page.getByRole('navigation', { name: 'MyFood navigation' }).getByRole('link'),
  ).toHaveCount(1)
  await expect(page.locator('[data-app="food"]')).toHaveCSS('--primary', '#39c98a')
  await page.reload()
  await expect(appSelector.getByRole('button', { name: 'MyFood' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.goto('/food/diary')
  await expect(page).toHaveURL(/\/food\/home$/)
  await expect(page.getByText('Coming Soon')).toBeVisible()
  await appSelector.getByRole('button', { name: 'MyHabbit' }).click()
  await expect(page).toHaveURL(/\/habits\/today$/)
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible()
  await expect(page.locator('[data-app="habit"]')).toHaveCSS('background-image', /50vh/)
  await expect(
    page.getByRole('navigation', { name: 'MyHabbit navigation' }).locator('svg').first(),
  ).toHaveCSS('color', 'rgb(237, 41, 57)')
  const habitNavigation = page.getByRole('navigation', { name: 'MyHabbit navigation' })
  await expect(habitNavigation.getByRole('button')).toHaveCount(1)
  await expect(habitNavigation.getByText('Today')).toBeDisabled()
  await expect(page.locator('[data-app="habit"]')).toHaveCSS('--primary', '#ed2939')
  await page.goto('/habits')
  await expect(page).toHaveURL(/\/habits\/today$/)
  await appSelector.getByRole('button', { name: 'My Money' }).click()
  await expect(page).toHaveURL(/\/money\/home/)
  await page.getByRole('link', { name: 'View budgets' }).click()
  await expect(page).toHaveURL(/\/money\/budgets/)
  await expect(page.getByRole('heading', { name: 'Budgets' })).toBeVisible()
  await page.goto('/money/home')
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
  await expect(personalLink).toHaveClass(/bg-card/)
  await expect(personalLink.locator('svg')).toBeVisible()
  await expect(page.locator('.bottom-nav')).toHaveCount(0)
  await expect(page.getByText(/Good (morning|afternoon|evening)/)).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Test!' })).toBeVisible()
  await expect(page.getByTestId('personal-greeting-emoji')).toHaveText(/🌅|☀️|🌙/)
  await expect(page.getByText('me@gmail.com')).toHaveCount(0)
  await expect(page.getByText(/track money, food, and habits/i)).toBeVisible()
  await expect(page.getByTestId('sync-state')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Active sessions' })).toBeVisible()
  await expect(page.locator('.personal-fixed-action')).toHaveCSS('position', 'fixed')
  await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'My Money Settings' })).toHaveCount(0)
  await appSelector.getByRole('button', { name: 'My Money' }).click()
  await expect(page).toHaveURL(/\/money\/home/)
  await expect(page.getByText(/Good (morning|afternoon|evening)/)).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Test!' })).toHaveCount(0)
  await expect(page.locator('.hero')).toHaveText(/Spent this month/)
  await page.getByRole('link', { name: 'Settings' }).click()
  await expect(page).toHaveURL(/\/money\/settings/)
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

test('legacy /home URL redirects to the MyMoney route', async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await fakeSignIn(page)
  await page.goto('/home')
  await expect(page).toHaveURL(/\/money\/home/)
  await expect(page.getByText('Spent this month')).toBeVisible()

  await page.goto('/transactions?filter=recent#latest')
  await expect(page).toHaveURL(/\/money\/transactions\?filter=recent#latest$/)

  await page.goto('/settings/accounts')
  await expect(page).toHaveURL(/\/money\/settings\/accounts/)
  await expect(page.getByRole('heading', { name: 'Payment Account' })).toBeVisible()
})

test('personal top navigation uses the Google avatar when available', async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  const picture = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs='
  await fakeSignIn(page, {
    sub: 'avatar-user',
    email: 'avatar@gmail.com',
    name: 'Avatar User',
    picture,
  })
  await page.goto('/money/home')

  const personalLink = page.getByRole('link', { name: 'Personal' })
  await expect(personalLink.locator('img')).toHaveAttribute('src', picture)
  await expect(personalLink.locator('svg')).toHaveCount(0)
})
