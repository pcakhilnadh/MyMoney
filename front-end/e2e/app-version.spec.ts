import { expect, test, type Page } from '@playwright/test'
import { fakeSignIn } from './helpers'
import pkg from '../package.json' with { type: 'json' }

async function openProfile(page: Page, server: object | null) {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await page.route('**/api/version', (route) =>
    server ? route.fulfill({ json: server }) : route.abort(),
  )
  await fakeSignIn(page)
  await page.goto('/personal')
}

test('the profile shows this build next to the deployed one', async ({ page }) => {
  await openProfile(page, { version: pkg.version, api: 'v1', apis: ['v1'], commit: 'abc1234' })
  await expect(page.getByTestId('app-version')).toHaveText(new RegExp(`^v${pkg.version}`))
  await expect(page.getByTestId('server-version')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Reload to update' })).toHaveCount(0)
})

test('a newer deploy offers a reload', async ({ page }) => {
  await openProfile(page, { version: '99.0.0', api: 'v1', apis: ['v1'], commit: null })
  await expect(page.getByTestId('server-version')).toHaveText('Server v99.0.0')
  await expect(page.getByRole('button', { name: 'Reload to update' })).toBeVisible()
})

test('an unreachable server is said plainly', async ({ page }) => {
  await openProfile(page, null)
  await expect(page.getByTestId('app-version')).toHaveText(new RegExp(`^v${pkg.version}`))
  await expect(page.getByRole('button', { name: 'Reload to update' })).toHaveCount(0)
})
