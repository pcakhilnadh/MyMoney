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
    await page.locator('[data-slot="select-content"][data-open]').getByRole('option', { name: unitLabels[value], exact: true }).click()
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
    await page.setViewportSize({ width: 320, height: 568 })
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
    expect(await dialog.evaluate((element) => {
      const bounds = element.getBoundingClientRect()
      return element.scrollWidth <= element.clientWidth
        && element.scrollHeight <= element.clientHeight
        && Array.from(element.querySelectorAll('button')).every((button) => {
          const box = button.getBoundingClientRect()
          return box.left >= bounds.left && box.right <= bounds.right
            && box.top >= bounds.top && box.bottom <= bounds.bottom
        })
    })).toBe(true)
    const video = dialog.getByLabel('Camera preview')
    await video.evaluate((element) => {
      const stream = (element as HTMLVideoElement).srcObject as MediaStream
      Object.assign(window, { foodCameraTrack: stream.getVideoTracks()[0] })
    })
    await capture.click()
    await expect(dialog).toBeHidden()
    const preview = page.getByRole('dialog', { name: 'Review food photo' })
    await expect(preview.getByRole('img', { name: 'Captured food' })).toBeVisible()
    await expect.poll(() => page.evaluate(() => {
      const track = (window as Window & { foodCameraTrack: MediaStreamTrack }).foodCameraTrack
      return track.readyState
    })).toBe('ended')
    const photo = JSON.parse((await page.locator('html').getAttribute('data-last-photo'))!)
    expect(photo.type).toBe('image/jpeg')
    expect(photo.size).toBeGreaterThan(0)
    expect(photo.size).toBeLessThanOrEqual(3 * 1024 * 1024)
    expect(uploads).toEqual([])
    await preview.getByRole('button', { name: 'Close preview' }).click()
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
    const preview = page.getByRole('dialog', { name: 'Review food photo' })
    await expect(preview.getByRole('img', { name: 'Captured food' })).toBeVisible()
    const photo = JSON.parse((await page.locator('html').getAttribute('data-last-photo'))!)
    expect(photo.type).toBe('image/jpeg')
    expect(photo.size).toBeLessThanOrEqual(3 * 1024 * 1024)
    await preview.getByRole('button', { name: 'Retake' }).click()
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
    await expect(page.getByRole('dialog', { name: 'Review food photo' }).getByRole('img', { name: 'Captured food' })).toBeVisible()
  })

  test('analyses, searches, creates a food and confirms without saving a meal', async ({ page }) => {
    let analysisBody: { images: { mime_type: string; data: string }[] } | undefined
    let createdBody: Record<string, unknown> | undefined
    let posts = 0
    await page.route('**/food/ai/food-analyse', async (route) => {
      analysisBody = route.request().postDataJSON()
      await route.fulfill({ json: { items: [
        { name: 'Rice puttu', canonical_name: 'rice puttu', qty: 100, unit: 'g', cal: 130, food_type: 'processed', food_category: 'grain' },
        { name: 'Sambar', canonical_name: 'sambar', qty: 150, unit: 'ml', cal: 90, food_type: 'processed', food_category: 'legume' },
        { name: 'Curry', canonical_name: 'curry', qty: 100, unit: 'g', cal: 100, food_type: 'processed', food_category: 'legume' },
      ] } })
    })
    await page.route('**/food/catalog/search-batch', async (route) => {
      expect(route.request().postDataJSON().queries).toEqual(['rice puttu', 'sambar', 'curry'])
      await route.fulfill({ json: { results: [
        { query: 'rice puttu', matches: [{ id: '1', name: 'Rice puttu', score: 1 }] },
        { query: 'sambar', matches: [{ id: '2', name: 'Sambar tiffin', score: 1 }, { id: '3', name: 'Dal sambar', score: 1 }] },
        { query: 'curry', matches: [] },
      ] } })
    })
    await page.route('**/food/catalog', async (route) => {
      posts += 1
      createdBody = route.request().postDataJSON()
      await route.fulfill({ status: 201, json: { id: '4', base_food_name: 'Curry', aliases: 'Kari', category: 'legume', food_type: 'processed' } })
    })
    await page.goto('/food/add')
    await page.getByRole('button', { name: 'Scan food' }).click()
    await page.getByLabel('Upload a food photo').setInputFiles('public\\icon-192.png')
    await page.getByRole('button', { name: 'Analyse with AI' }).click()
    await expect(page.getByRole('heading', { name: 'Review scan' })).toBeVisible()
    expect(analysisBody?.images[0].mime_type).toBe('image/jpeg')
    expect(analysisBody?.images[0].data.length).toBeGreaterThan(0)
    await page.getByRole('button', { name: 'Search catalog' }).click()
    await expect(page.getByRole('button', { name: 'Rice puttu', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'Resolve 2 more' })).toBeDisabled()
    await page.getByRole('button', { name: 'Dal sambar' }).click()
    await page.getByRole('button', { name: '+ Create “Curry”' }).click()
    const create = page.getByRole('dialog', { name: 'Create food' })
    await create.getByLabel('Food name', { exact: true }).fill('Curry')
    await create.getByLabel('Regional names (comma-separated)').fill('Kari')
    await create.getByLabel('Food image (optional)').setInputFiles('public\\icon-192.png')
    await create.getByRole('button', { name: 'Save food' }).click()
    await expect(create).toBeHidden()
    await expect(page.getByText('Created: processed · legume · Kari')).toBeVisible()
    expect(createdBody?.aliases).toBe('Kari')
    expect(createdBody?.image).toBeTruthy()
    await page.getByRole('button', { name: 'Continue to confirmation' }).click()
    await expect(page.getByRole('heading', { name: 'Your meal' })).toBeVisible()
    await expect(page.getByRole('spinbutton', { name: 'Amount for Dal sambar' })).toHaveValue('150')
    await expect(page.getByRole('combobox', { name: 'Unit for Dal sambar' })).toContainText('Millilitres (ml)')
    await page.getByRole('button', { name: 'Remove Sambar' }).click()
    await page.getByRole('button', { name: 'Save as one meal' }).click()
    expect(posts).toBe(1)
    await page.getByRole('button', { name: 'Cancel', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Log Meal' })).toBeVisible()
  })

  test('locks scan removal after searching and shows sorted, limited match choices', async ({ page }) => {
    let releaseSearch: (() => void) | undefined
    const gate = new Promise<void>((resolve) => { releaseSearch = resolve })
    let searchCount = 0
    await page.route('**/food/ai/food-analyse', (route) => route.fulfill({ json: { items: [
      { name: 'Rice', canonical_name: 'rice', qty: 1.5, unit: 'kg', cal: 400, food_type: 'processed', food_category: 'grain' },
      { name: 'Egg', canonical_name: 'egg', qty: 2, unit: 'Nos', cal: 140, food_type: 'processed', food_category: 'egg' },
    ] } }))
    await page.route('**/food/catalog/search-batch', async (route) => {
      searchCount += 1
      await gate
      await route.fulfill({ json: { results: [
        { query: 'rice', matches: [
          { id: '1', name: 'Rice variety 1', score: 0.1 },
          { id: '2', name: 'Rice variety 2', score: 0.2 },
          { id: '3', name: 'Rice variety 3', score: 0.3 },
          { id: '4', name: 'Rice variety 4', score: 0.4 },
          { id: '5', name: 'Rice variety 5', score: 0.5 },
          { id: '6', name: 'Rice variety 6', score: 0.6 },
          { id: '7', name: 'Rice variety 7', score: 0.7 },
        ] },
        { query: 'egg', matches: [{ id: '8', name: 'Boiled egg', score: 0.9 }] },
      ] } })
    })
    await page.goto('/food/add')
    await page.getByRole('button', { name: 'Scan food' }).click()
    await page.getByLabel('Upload a food photo').setInputFiles('public\\icon-192.png')
    await page.getByRole('button', { name: 'Analyse with AI' }).click()
    const progress = page.getByRole('list', { name: 'Scan progress' })
    expect(await progress.evaluate((element) => parseFloat(getComputedStyle(element, '::before').width))).toBeGreaterThan(100)
    await page.getByRole('button', { name: 'Search catalog' }).click()
    await expect(page.getByRole('button', { name: 'Remove Rice' })).toBeDisabled()
    releaseSearch!()
    const rice = page.locator('section').filter({ has: page.getByRole('heading', { name: '1 · Rice' }) })
    const egg = page.locator('section').filter({ has: page.getByRole('heading', { name: '2 · Egg' }) })
    await expect(rice.getByText('Choose One')).toBeVisible()
    await expect(egg.getByText('Exact match')).toBeVisible()
    await expect(egg.getByRole('button', { name: 'Boiled egg' })).toHaveAttribute('aria-pressed', 'true')
    await expect(egg.getByRole('button', { name: /Create/ })).toHaveCount(0)
    await expect(rice.getByRole('button', { name: /Rice variety/ })).toHaveCount(6)
    await expect(rice.getByRole('button', { name: /Rice variety/ }).first()).toHaveText('Rice variety 7')
    await expect(rice.getByRole('button', { name: 'Rice variety 1' })).toHaveCount(0)
    await page.getByRole('button', { name: 'Back' }).click()
    await expect(page.getByRole('button', { name: 'Remove Rice' })).toBeDisabled()
    await page.getByRole('button', { name: 'Continue to search results' }).click()
    expect(searchCount).toBe(1)
    await rice.getByRole('button', { name: 'Rice variety 7' }).click()
    await page.getByRole('button', { name: 'Continue to confirmation' }).click()
    await expect(page.getByRole('spinbutton', { name: 'Amount for Rice variety 7' })).toHaveValue('1.5')
    await expect(page.getByRole('combobox', { name: 'Unit for Rice variety 7' })).toContainText('Kilograms (kg)')
    await expect(page.getByRole('spinbutton', { name: 'Amount for Boiled egg' })).toHaveValue('2')
    await expect(page.getByRole('combobox', { name: 'Unit for Boiled egg' })).toContainText('Count')
    await page.getByRole('spinbutton', { name: 'Amount for Boiled egg' }).fill('3')
    await page.getByRole('button', { name: 'Back' }).click()
    await page.getByRole('button', { name: 'Continue to confirmation' }).click()
    await expect(page.getByRole('spinbutton', { name: 'Amount for Boiled egg' })).toHaveValue('3')
  })

  test('falls back to search when a scan finds nothing or the AI fails', async ({ page }) => {
    let analysisCount = 0
    let batches = 0
    const scan = { name: 'Egg', canonical_name: 'egg', qty: 1, unit: 'Nos', cal: 70, food_type: 'processed', food_category: 'egg' }
    await page.route('**/food/ai/food-analyse', (route) => {
      analysisCount += 1
      if (analysisCount === 2)
        return route.fulfill({ status: 502, json: { detail: 'AI provider unavailable' } })
      return route.fulfill({ json: { items: analysisCount === 1 ? [] : Array.from({ length: 11 }, () => scan) } })
    })
    await page.route('**/food/catalog/search-batch', (route) => {
      batches += 1
      if (batches === 1) return route.fulfill({ status: 503, json: { detail: 'Search unavailable' } })
      const queries: string[] = route.request().postDataJSON().queries
      return route.fulfill({ json: { results: queries.map((query) => ({ query, matches: [{ id: 'egg', name: 'Egg', score: 1 }] })) } })
    })
    await page.route('**/food/catalog?*', (route) => route.fulfill({ json: [{ id: 'egg', name: 'Egg' }] }))
    await page.goto('/food/add')
    async function analyse() {
      await page.getByRole('button', { name: 'Scan food' }).click()
      await page.getByLabel('Upload a food photo').setInputFiles('public\\icon-192.png')
      await page.getByRole('button', { name: 'Analyse with AI' }).click()
    }
    const notice = page.getByRole('status').filter({ hasText: 'Our AI magic is unavailable' })
    await analyse()
    await expect(notice).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Review scan' })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Search catalog' })).toHaveCount(0)
    await notice.getByRole('button', { name: 'Dismiss AI scan notice' }).click()
    await expect(notice).toHaveCount(0)
    await analyse()
    await expect(notice).toBeVisible()
    await page.getByRole('searchbox', { name: 'Search foods' }).fill('egg')
    await page.getByRole('button', { name: 'Search', exact: true }).click()
    await expect(notice).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Egg', exact: true })).toBeVisible()
    await analyse()
    await page.getByRole('button', { name: 'Search catalog' }).click()
    await expect(page.getByRole('alert')).toHaveText('Search unavailable')
    await expect(page.getByRole('heading', { name: '1 · Egg', exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Search catalog' }).click()
    await expect(page.getByRole('button', { name: 'Continue to confirmation' })).toBeEnabled()
    expect(batches).toBe(3)
  })

  test('shows an empty review after removing all scanned items', async ({ page }) => {
    await page.route('**/food/ai/food-analyse', (route) => route.fulfill({ json: { items: [
      { name: 'Egg', canonical_name: 'egg', qty: 1, unit: 'Nos', cal: 70, food_type: 'processed', food_category: 'egg' },
    ] } }))
    await page.goto('/food/add')
    await page.getByRole('button', { name: 'Scan food' }).click()
    await page.getByLabel('Upload a food photo').setInputFiles('public\\icon-192.png')
    await page.getByRole('button', { name: 'Analyse with AI' }).click()
    await page.getByRole('button', { name: 'Remove Egg' }).click()
    await expect(page.getByText('No items remain in this scan.', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Search catalog' })).toBeDisabled()
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
