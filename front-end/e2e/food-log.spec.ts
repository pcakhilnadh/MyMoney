import { expect, test } from '@playwright/test'
import { fakeSignIn } from './helpers'

test.use({
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
})

test('search results stay hidden until a search happens, then show equal-width tags', async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  let releaseSearch: (() => void) | undefined
  const searchGate = new Promise<void>((resolve) => { releaseSearch = resolve })
  await page.route('**/food/catalog?*', async (route) => {
    await searchGate
    await route.fulfill({
      json: [{ id: 'egg', name: 'Egg' }, { id: 'milk', name: 'Milk' }, { id: 'oats', name: 'Oats' }],
    })
  })
  await fakeSignIn(page)
  await page.goto('/food/add')
  await expect(page.getByRole('heading', { name: 'Log Meal' })).toBeVisible()

  // Nothing about results is rendered before the first search: no heading, no clutter.
  await expect(page.getByText('Search results')).toHaveCount(0)

  await page.getByRole('searchbox', { name: 'Search foods' }).fill('egg')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Search results' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Searching foods…' })).toBeVisible()
  const placeholders = page.locator('.shimmer-pulse')
  await expect(placeholders).toHaveCount(6)
  await expect(placeholders.first()).toHaveCSS('animation-name', 'shimmer-sweep')
  await expect(placeholders.first()).toHaveCSS('background-image', /linear-gradient/)
  const initialPosition = await placeholders.first().evaluate((element) => getComputedStyle(element).backgroundPosition)
  await expect.poll(() => placeholders.first().evaluate((element) => getComputedStyle(element).backgroundPosition))
    .not.toBe(initialPosition)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await expect(placeholders.first()).toHaveCSS('animation-name', 'none')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  releaseSearch!()
  await expect(page.getByRole('heading', { name: 'Searching foods…' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Search results' })).toBeVisible()

  const egg = page.getByRole('button', { name: 'Egg', exact: true })
  const milk = page.getByRole('button', { name: 'Milk', exact: true })
  const oats = page.getByRole('button', { name: 'Oats', exact: true })
  await expect(egg).toBeVisible()
  // Equal-width tags: every tag in the grid shares the same column width.
  const widths = await Promise.all(
    [egg, milk, oats].map((tag) => tag.evaluate((el) => el.getBoundingClientRect().width)),
  )
  expect(Math.abs(widths[0] - widths[1])).toBeLessThan(2)
  expect(Math.abs(widths[1] - widths[2])).toBeLessThan(2)

  await egg.click()
  await expect(egg).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('heading', { name: 'Your meal' })).toBeVisible()
  await expect(page.getByText('1 item added to this meal')).toBeVisible()
  await milk.click()
  await expect(page.getByText('2 items added to this meal')).toBeVisible()
  await egg.click()
  await expect(egg).toHaveAttribute('aria-pressed', 'false')
  await expect(page.getByText('1 item added to this meal')).toBeVisible()
  await egg.click()
  await expect(page.getByText('2 items added to this meal')).toBeVisible()
})

test('intelligent per-unit steppers and conversions', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 780 })
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await page.route('**/food/catalog?*', (route) => route.fulfill({
    json: [{ id: 'egg', name: 'Egg' }, { id: 'milk', name: 'Milk' }],
  }))
  await fakeSignIn(page)
  await page.goto('/food/add')
  await page.getByRole('searchbox', { name: 'Search foods' }).fill('egg')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('button', { name: 'Egg', exact: true }).click()
  await page.getByRole('button', { name: 'Milk', exact: true }).click()

  const amount = page.getByRole('spinbutton', { name: 'Amount for Egg' })
  const unitLabels: Record<string, string> = {
    g: 'Grams (g)', kg: 'Kilograms (kg)', ml: 'Millilitres (ml)', litre: 'Litres (L)',
    tsp: 'Teaspoon (5 ml)', tbsp: 'Tablespoon (15 ml)', cup: 'Cup (250 ml)', count: 'Count',
  }
  const chooseUnit = async (name: string, value: string) => {
    const trigger = page.getByRole('combobox', { name })
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()
    await page.getByRole('option', { name: unitLabels[value], exact: true }).click()
  }
  const unit = { selectOption: (value: string) => chooseUnit('Unit for Egg', value) }
  const themedSurfaces = await amount.evaluate((input) => {
    const root = input.closest('.food-log')!
    const well = input.parentElement!
    const search = root.querySelector<HTMLInputElement>('input[type="search"]')!
    const select = root.querySelector<HTMLElement>('[data-slot="select-trigger"]')!
    const item = input.closest('.food-item-card')!
    const meal = root.querySelector('section[aria-labelledby="meal-title"]')!
    const probe = document.createElement('div')
    probe.style.background = 'linear-gradient(145deg, var(--food-log-raised), var(--food-log-base))'
    root.appendChild(probe)
    const expectedGradient = getComputedStyle(probe).backgroundImage
    probe.style.background = 'var(--food-log-inset)'
    const expectedInset = getComputedStyle(probe).backgroundColor
    probe.style.background = 'var(--food-log-base)'
    const base = getComputedStyle(probe).backgroundColor
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const context = canvas.getContext('2d')!
    context.fillStyle = base
    context.fillRect(0, 0, 1, 1)
    const [red, green, blue] = context.getImageData(0, 0, 1, 1).data
    probe.style.background = 'linear-gradient(145deg, color-mix(in srgb, var(--food-log-raised) 85%, var(--background) 15%), color-mix(in srgb, var(--food-log-base) 85%, var(--background) 15%))'
    const expectedItemBackground = getComputedStyle(probe).backgroundImage
    probe.style.background = 'color-mix(in srgb, var(--food-log-base) 85%, var(--background) 15%)'
    context.clearRect(0, 0, 1, 1)
    context.fillStyle = getComputedStyle(probe).backgroundColor
    context.fillRect(0, 0, 1, 1)
    const [itemRed, itemGreen, itemBlue] = context.getImageData(0, 0, 1, 1).data
    const result = {
      raised: getComputedStyle(item).backgroundImage,
      expectedGradient,
      well: getComputedStyle(well).backgroundColor,
      field: getComputedStyle(search).backgroundColor,
      expectedInset,
      option: getComputedStyle(select).backgroundColor,
      base,
      red,
      green,
      blue,
      itemBackground: getComputedStyle(item).backgroundImage,
      expectedItemBackground,
      mealBackground: getComputedStyle(meal).backgroundImage,
      itemRed,
      itemGreen,
      itemBlue,
    }
    probe.remove()
    return result
  })
  expect(themedSurfaces.green).toBeGreaterThan(themedSurfaces.red)
  expect(themedSurfaces.green).toBeGreaterThan(themedSurfaces.blue)
  expect(themedSurfaces.well).toBe(themedSurfaces.expectedInset)
  expect(themedSurfaces.field).toBe(themedSurfaces.expectedInset)
  expect(themedSurfaces.option).toBe(themedSurfaces.expectedInset)
  expect(themedSurfaces.itemBackground).not.toBe(themedSurfaces.mealBackground)
  expect(themedSurfaces.itemBackground).toBe(themedSurfaces.expectedItemBackground)
  expect(themedSurfaces.itemGreen).toBeGreaterThan(themedSurfaces.itemRed)
  expect(themedSurfaces.itemGreen).toBeGreaterThan(themedSurfaces.itemBlue)
  expect(themedSurfaces.itemGreen).toBeLessThan(themedSurfaces.green)
  await expect(amount).toHaveValue('100')
  const increase = page.getByRole('button', { name: 'Increase Egg' })
  const decrease = page.getByRole('button', { name: 'Decrease Egg' })
  for (const [value, initial, increased, minimum] of [
    ['g', '100', '150', '50'],
    ['ml', '100', '150', '50'],
    ['kg', '2', '2.5', '0.5'],
    ['litre', '2', '2.5', '0.5'],
    ['tsp', '2', '2.5', '0.5'],
    ['tbsp', '2', '2.5', '0.5'],
    ['cup', '2', '2.5', '0.5'],
    ['count', '2', '2.5', '0.5'],
  ]) {
    await unit.selectOption(value)
    await amount.fill(initial)
    await increase.click()
    await expect(amount).toHaveValue(increased)
    await decrease.click()
    await expect(amount).toHaveValue(initial)
    await amount.fill(minimum)
    await expect(decrease).toBeDisabled()
  }

  await unit.selectOption('g')
  await amount.fill('100')
  await unit.selectOption('kg')
  await expect(amount).toHaveValue('0.1')
  await unit.selectOption('count')
  await expect(amount).toHaveValue('1')
  await expect(page.getByLabel('Count description for Egg')).toHaveCount(0)
  await expect(page.getByPlaceholder('e.g. eggs or glasses')).toHaveCount(0)
  await unit.selectOption('kg')
  await expect(amount).toHaveValue('0.1')
  await expect(decrease).toBeDisabled()

  const milkAmount = page.getByRole('spinbutton', { name: 'Amount for Milk' })
  const milkUnit = { selectOption: (value: string) => chooseUnit('Unit for Milk', value) }
  await milkUnit.selectOption('cup')
  await expect(milkAmount).toHaveValue('1')
  await milkUnit.selectOption('tbsp')
  await expect(page.getByText('≈ 250 ml total · 1 cup = 250 ml', { exact: true })).toBeVisible()
  await milkUnit.selectOption('ml')
  await expect(milkAmount).toHaveValue('250')
  // No redundant conversion note once the unit already matches the base unit.
  await expect(page.getByText('≈ 250 ml total · 1 cup = 250 ml', { exact: true })).toHaveCount(0)

  await page.getByRole('button', { name: 'Remove Egg' }).click()
  await expect(page.getByRole('spinbutton', { name: 'Amount for Egg' })).toHaveCount(0)
  await expect(page.getByText('1 item added to this meal')).toBeVisible()
})

test('save meal gives feedback without persisting anything', async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await page.route('**/food/catalog?*', (route) => route.fulfill({
    json: [{ id: 'egg', name: 'Egg' }],
  }))
  const requests: string[] = []
  page.on('request', (request) => {
    if (request.method() !== 'GET' && !request.url().includes('/auth/')) requests.push(request.url())
  })
  await fakeSignIn(page)
  await page.goto('/food/add')
  await page.getByRole('searchbox', { name: 'Search foods' }).fill('egg')
  await page.getByRole('button', { name: 'Search', exact: true }).click()
  await page.getByRole('button', { name: 'Egg', exact: true }).click()

  const saveButton = page.getByRole('button', { name: 'Save meal · 1 item' })
  await expect(saveButton).toBeVisible()
  await expect(page.getByText('Saving will sync with your diary soon — for now this is just a preview.')).toBeVisible()
  await page.clock.install()
  await saveButton.click()
  await expect(page.getByRole('button', { name: 'Meal saved' })).toBeDisabled()
  await page.clock.fastForward(1800)
  await expect(page.getByRole('button', { name: 'Save meal · 1 item' })).toBeEnabled()
  expect(requests).toEqual([])
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
    await page.getByRole('button', { name: 'Dismiss photo notice' }).click()
    await expect(page.getByText('Photo captured. Food analysis is not available yet; the photo was not saved.')).toHaveCount(0)
    await page.getByRole('button', { name: 'Scan food' }).click()
    await expect(dialog).toBeVisible()
    await dialog.getByRole('button', { name: 'Cancel' }).click()
    await expect(dialog).toBeHidden()
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
