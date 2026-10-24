import { expect, test } from '@playwright/test'
import { fakeSignIn } from '../e2e/helpers'

test('installable and reloads offline from the service worker', async ({ page, context }) => {
  await fakeSignIn(page)
  await page.goto('/money/home')
  await page.evaluate(() => navigator.serviceWorker.ready)
  const manifest = await (await page.request.get('/manifest.webmanifest')).json()
  expect(manifest.display).toBe('standalone')

  await page.reload() // let the SW take control
  await context.setOffline(true)
  await page.reload()
  await expect(page.getByText('Spent this month')).toBeVisible({ timeout: 3000 })
})

test('offers an install action when Chrome exposes the install prompt', async ({ page }) => {
  await page.goto('/login')
  await expect(page.getByText(/Manage your money/)).toBeVisible()

  await page.evaluate(() => {
    const event = new Event('beforeinstallprompt')
    Object.defineProperties(event, {
      prompt: { value: async () => undefined },
      userChoice: { value: Promise.resolve({ outcome: 'accepted' }) },
    })
    window.dispatchEvent(event)
  })

  const installButton = page.getByRole('button', { name: 'Install MyTracker as an app' })
  await expect(installButton).toBeVisible()
  await installButton.click()
  await expect(installButton).toHaveCount(0)
})
