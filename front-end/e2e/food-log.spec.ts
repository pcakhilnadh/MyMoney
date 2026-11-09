import { expect, test } from '@playwright/test'
import { fakeSignIn } from './helpers'

test.use({
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
})

test('search and prepare food portions', async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  let releaseSearch: (() => void) | undefined
  const searchGate = new Promise<void>((resolve) => { releaseSearch = resolve })
  await page.route('**/food/catalog?*', async (route) => {
    await searchGate
    await route.fulfill({
      json: [{ id: 'egg', name: 'Egg' }, { id: 'milk', name: 'Milk' }],
    })
  })
  await fakeSignIn(page)
  await page.goto('/food/home')
  await page.getByRole('link', { name: 'Add meal' }).click()
  await expect(page.getByRole('heading', { name: 'Log Meal' })).toBeVisible()
  await page.getByRole('searchbox', { name: 'Search foods' }).fill('egg')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByText('Searching foods…')).toBeVisible()
  releaseSearch!()
  await page.getByRole('button', { name: 'Egg', exact: true }).click()
  await page.getByRole('button', { name: 'Milk', exact: true }).click()
  await expect(page.locator('details')).toHaveCount(2)
  await page.getByRole('button', { name: 'Egg', exact: true }).click()
  await expect(page.locator('details')).toHaveCount(1)
  await page.getByRole('button', { name: 'Egg', exact: true }).click()
  await expect(page.locator('details')).toHaveCount(2)

  const amount = page.getByRole('spinbutton', { name: 'Amount for Egg' })
  const unit = page.getByLabel('Unit for Egg')
  await expect(amount).toHaveValue('100')
  await page.getByRole('button', { name: 'Increase Egg' }).click()
  await expect(amount).toHaveValue('150')
  await page.getByRole('button', { name: 'Decrease Egg' }).click()
  await expect(amount).toHaveValue('100')
  await unit.selectOption('kg')
  await expect(amount).toHaveValue('0.1')
  await page.getByRole('button', { name: 'Increase Egg' }).click()
  await expect(amount).toHaveValue('0.15')
  await unit.selectOption('count')
  await expect(amount).toHaveValue('1')
  await page.getByLabel('Count description for Egg').fill('eggs')
  await page.getByRole('button', { name: 'Increase Egg' }).click()
  await expect(amount).toHaveValue('2')
  await unit.selectOption('kg')
  await expect(amount).toHaveValue('0.1')

  const milkAmount = page.getByRole('spinbutton', { name: 'Amount for Milk' })
  const milkUnit = page.getByLabel('Unit for Milk')
  await milkUnit.selectOption('cup')
  await expect(milkAmount).toHaveValue('1')
  await milkUnit.selectOption('tbsp')
  await expect(page.getByText('250 ml (1 cup = 250 ml)', { exact: true })).toBeVisible()
  await milkUnit.selectOption('ml')
  await expect(milkAmount).toHaveValue('250')
  await page.locator('details').filter({ hasText: 'Milk' }).locator('summary').click()
  await expect(milkAmount).toBeHidden()
  await page.getByRole('button', { name: 'Remove Egg' }).click()
  await expect(page.locator('details')).toHaveCount(1)
  await expect(page.getByText('These portions are a draft and are not saved.')).toBeVisible()
})

test.describe('food scanner', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/auth/refresh', (route) => route.abort())
    await page.route('**/auth/login', (route) => route.abort())
    await fakeSignIn(page)
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.toBlob
      HTMLCanvasElement.prototype.toBlob = function (callback, type, quality) {
        return original.call(this, (blob) => {
          if (blob) {
            const details = { type: blob.type, size: blob.size }
            document.documentElement.dataset.lastPhoto = JSON.stringify(details)
          }
          callback(blob)
        }, type, quality)
      }
    })
  })

  test('captures and compresses a photo without uploading it', async ({ page }) => {
    const uploads: string[] = []
    page.on('request', (request) => {
      if (request.method() === 'POST' && !request.url().includes('/auth/')) uploads.push(request.url())
    })
    await page.goto('/food/add')
    await page.getByRole('button', { name: 'Scan food' }).click()
    const dialog = page.getByRole('dialog', { name: 'Scan food' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('heading', { name: 'Scan food' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Mirror preview on' })).toHaveCSS('color', 'rgb(57, 201, 138)')
    await dialog.getByRole('button', { name: 'Mirror preview on' }).click()
    await expect(dialog.getByRole('button', { name: 'Mirror preview off' })).toBeVisible()
    const capture = dialog.getByRole('button', { name: 'Capture photo' })
    await expect(capture).toBeEnabled()
    const video = dialog.getByLabel('Camera preview')
    await video.evaluate((element) => {
      const stream = (element as HTMLVideoElement).srcObject as MediaStream
      Object.assign(window, { foodCameraTrack: stream.getVideoTracks()[0] })
    })
    await capture.click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Photo captured. Food analysis is not available yet; the photo was not saved.')).toBeVisible()
    await expect.poll(() => page.evaluate(() => {
      const track = (window as Window & { foodCameraTrack: MediaStreamTrack }).foodCameraTrack
      return track.readyState
    })).toBe('ended')
    const photo = JSON.parse((await page.locator('html').getAttribute('data-last-photo'))!)
    expect(photo.type).toBe('image/jpeg')
    expect(photo.size).toBeGreaterThan(0)
    expect(photo.size).toBeLessThanOrEqual(3 * 1024 * 1024)
    expect(uploads).toEqual([])
  })

  test('uploads a PNG as JPEG, reports invalid images, and allows cancellation', async ({ page }) => {
    await page.goto('/food/add')
    await page.getByRole('button', { name: 'Scan food' }).click()
    const dialog = page.getByRole('dialog', { name: 'Scan food' })
    await dialog.getByLabel('Upload a food photo').setInputFiles({
      name: 'invalid.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image'),
    })
    await expect(dialog.getByRole('alert')).toHaveText('Choose a JPEG, PNG or WebP image.')
    await dialog.getByLabel('Upload a food photo').setInputFiles('public\\icon-192.png')
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Photo captured. Food analysis is not available yet; the photo was not saved.')).toBeVisible()
    const photo = JSON.parse((await page.locator('html').getAttribute('data-last-photo'))!)
    expect(photo.type).toBe('image/jpeg')
    expect(photo.size).toBeLessThanOrEqual(3 * 1024 * 1024)
    await page.getByRole('button', { name: 'Scan food' }).click()
    await expect(page.getByText('Photo captured. Food analysis is not available yet; the photo was not saved.')).toBeHidden()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
  })

  test('shows camera errors and offers an upload fallback', async ({ page }) => {
    await page.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = async () => {
        throw new DOMException('Denied', 'NotAllowedError')
      }
    })
    await page.goto('/food/add')
    await page.getByRole('button', { name: 'Scan food' }).click()
    const dialog = page.getByRole('dialog', { name: 'Scan food' })
    await expect(dialog.getByText('We could not open the camera. Check the browser permission.')).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Take a photo' })).toBeVisible()
    await dialog.getByLabel('Upload a food photo').setInputFiles('public\\icon-192.png')
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Photo captured. Food analysis is not available yet; the photo was not saved.')).toBeVisible()
  })
})

test('food search reports empty and failed searches', async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await page.route('**/food/catalog?*', (route) => route.fulfill({ status: 500 }))
  await fakeSignIn(page)
  await page.goto('/food/add')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Enter a food name to search.')
  await page.getByRole('searchbox', { name: 'Search foods' }).fill('egg')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('alert')).toHaveText('Unable to search foods. Check your connection and try again.')
})
