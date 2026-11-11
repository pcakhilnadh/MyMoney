import { expect, test } from '@playwright/test'
import { chooseCategory, fakeSignIn } from './helpers'

// Fake camera device so the bill-capture flow can run headlessly.
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  },
})

test.beforeEach(async ({ page }) => {
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await fakeSignIn(page, { sub: 'add-txn-user', email: 'addtxn@gmail.com', name: 'Add Txn User' })
})

test('required fields come first, are marked, and a category can be created inline', async ({
  page,
}) => {
  await page.goto('/money/expenses/new')

  const labels = await page
    .locator('label > span.label, div.relative > span.label, h2.label')
    .allTextContents()
  expect(labels.map((text) => text.replace('*', '').replace('(optional)', '').trim())).toEqual([
    'Title',
    'Amount',
    'Date',
    'Category',
    'Paid from',
    'Optional details',
    'Merchant',
    'Long Description',
  ])
  await expect(page.getByLabel('Title')).toBeFocused()
  await expect(page.getByLabel('Title')).toHaveAttribute('aria-required', 'true')
  await expect(page.getByText('Still needed: Title, Amount, Category, Account')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Category', exact: true })).toHaveValue('')

  await page.getByLabel('Title').fill('x')
  await page.getByLabel('Title').fill('')
  await page.getByLabel('Amount').focus()
  await expect(page.getByText('Give this transaction a short title.')).toHaveCount(0)

  // Typing an unknown name offers to create it; Enter picks the offered action.
  const category = page.getByRole('combobox', { name: 'Category', exact: true })
  await category.fill('Pet care')
  await expect(page.getByRole('option', { name: 'Add category Pet care' })).toBeVisible()
  await category.press('ArrowDown')
  await category.press('Enter')
  await expect(category).toHaveValue('Pet care')
  await expect(category).toHaveAttribute('aria-expanded', 'false')
  await expect(page.getByRole('button', { name: 'Clear selection' })).toBeVisible()

  // The new category is now a regular option and can be cleared again.
  await page.getByRole('button', { name: 'Clear selection' }).click()
  await expect(category).toHaveValue('')
  await category.fill('pet')
  await expect(page.getByRole('option', { name: 'Pet care', exact: true })).toBeVisible()
})

test('category and date toggle, categories are sorted and transfers default to Self Transfer', async ({
  page,
}) => {
  await page.goto('/money/expenses/new')
  for (const type of ['Expense', 'Income', 'Transfer', 'Refund']) {
    await page.getByRole('button', { name: type, exact: true }).click()
    await expect(page.getByRole('button', { name: 'Scan a bill' })).toHaveCount(
      type === 'Expense' ? 1 : 0,
    )
    const category = page.getByRole('combobox', {
      name: type === 'Refund' ? 'Expense category' : 'Category',
      exact: true,
    })
    if (type === 'Transfer') await expect(category).toHaveValue('Self Transfer')
    else await expect(category).toHaveValue('')
    await category.click()
    const names = await page.getByRole('option').allTextContents()
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)))
    await category.click()
    await expect(category).toHaveAttribute('aria-expanded', 'false')
  }
  const date = page.getByRole('button', { name: 'Date', exact: true })
  await date.click()
  await expect(page.getByRole('dialog', { name: 'Choose date' })).toBeVisible()
  await date.click()
  await expect(page.getByRole('dialog', { name: 'Choose date' })).toHaveCount(0)
  await date.click()
  await page.getByRole('button', { name: 'Previous month', exact: true }).click()
  const selectedDay = page
    .getByRole('dialog', { name: 'Choose date' })
    .getByRole('button', { name: /1,? \d{4}/ })
    .first()
  await selectedDay.click()
  await expect(page.getByRole('dialog', { name: 'Choose date' })).toHaveCount(0)
})

test('group context offers a way to add a group', async ({ page }) => {
  await page.goto('/money/expenses/new')
  const personal = page.getByRole('button', { name: 'Personal', exact: true })
  const group = page.getByRole('button', { name: 'Group', exact: true })
  await expect(personal).toHaveAttribute('aria-pressed', 'true')
  await expect(group).toHaveAttribute('aria-pressed', 'false')
  await expect(personal).toHaveCSS('color', 'rgb(75, 139, 255)')
  await expect(personal).toHaveCSS('background-image', 'none')
  await expect(page.getByRole('button', { name: 'Save Expense' })).not.toHaveCSS(
    'background-image',
    'none',
  )
  expect(
    await page.getByLabel('Long Description').evaluate((element) => {
      const group = [...document.querySelectorAll('button')].find(
        (button) => button.textContent === 'Group',
      )
      return (
        !!group && !!(element.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING)
      )
    }),
  ).toBe(true)
  await group.click()
  await expect(group).toHaveAttribute('aria-pressed', 'true')
  await expect(personal).toHaveAttribute('aria-pressed', 'false')
  await expect(group).toHaveCSS('color', 'rgb(75, 139, 255)')
  await expect(group).toHaveCSS('background-image', 'none')
  await expect(page.getByText("You don't have a group yet.")).toBeVisible()
  await expect(page.getByRole('link', { name: 'Add a group' })).toHaveAttribute(
    'href',
    '/money/groups',
  )
  await expect(page.getByRole('button', { name: 'Save and Split' })).toBeDisabled()
  await personal.click()
  await expect(personal).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('button', { name: 'Save Expense' })).toBeVisible()
})

test('the account selector toggles across its whole trigger', async ({ page }) => {
  await page.goto('/money/settings/accounts')
  await page.getByRole('button', { name: 'Add payment account' }).click()
  await page.getByPlaceholder('e.g., ICICI Bank').fill('Wallet')
  await page.getByRole('button', { name: 'Add Account' }).click()
  await page.goto('/money/expenses/new')
  const account = page.getByRole('combobox', { name: 'Paid from' })
  await expect(account).toContainText('Wallet')
  await account.click({ position: { x: 10, y: 10 } })
  await expect(account).toHaveAttribute('aria-expanded', 'true')
  await account.click({ position: { x: 10, y: 10 } })
  await expect(account).toHaveAttribute('aria-expanded', 'false')
  await page.getByLabel('Title').fill('Date picker test')
  await page.getByLabel('Amount').fill('25')
  await chooseCategory(page, 'Food & Dining')
  const date = await page.evaluate(() => {
    const now = new Date()
    const selected = new Date(now.getFullYear(), now.getMonth() - 1, 15)
    return {
      label: selected.toLocaleDateString(undefined, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }),
      value: `${selected.getFullYear()}-${String(selected.getMonth() + 1).padStart(2, '0')}-15`,
    }
  })
  await page.getByRole('button', { name: 'Date', exact: true }).click()
  await page.getByRole('button', { name: 'Previous month', exact: true }).click()
  await page.getByRole('button', { name: date.label, exact: true }).click()
  await page.getByRole('button', { name: 'Save Expense' }).click()
  await page.getByRole('button', { name: 'Previous month' }).click()
  await page.getByRole('button', { name: /Expense: Date picker test/ }).click()
  await page.getByRole('button', { name: 'Edit transaction' }).click()
  await expect(page.getByLabel('Date')).toHaveValue(date.value)
})

test.describe('bill capture', () => {
  for (const mirrored of [true, false]) {
    test(`camera capture and submitted image match the ${mirrored ? 'mirrored' : 'unmirrored'} preview`, async ({ page }) => {
      await page.route('**/auth/refresh', (route) => route.fulfill({
        json: {
          access_token: 'test-access-token',
          token_type: 'bearer',
          user: { sub: 'add-txn-user', email: 'addtxn@gmail.com', name: 'Add Txn User' },
        },
      }))
      await page.addInitScript(() => {
        const canvas = document.createElement('canvas')
        canvas.width = 640
        canvas.height = 480
        const context = canvas.getContext('2d')!
        const draw = () => {
          context.fillStyle = '#ff0000'
          context.fillRect(0, 0, 320, 480)
          context.fillStyle = '#0000ff'
          context.fillRect(320, 0, 320, 480)
        }
        navigator.mediaDevices.getUserMedia = async () => {
          const stream = canvas.captureStream(10)
          draw()
          window.setInterval(draw, 100)
          return stream
        }
      })
      let submittedImage = ''
      await page.route('**/money/ai/expense', async (route) => {
        submittedImage = route.request().postDataJSON().images[0].data
        await route.fulfill({ json: { is_bill: false } })
      })
      await page.goto('/money/expenses/new')
      await page.getByRole('button', { name: 'Scan a bill' }).click()
      if (!mirrored) await page.getByRole('button', { name: 'Mirror preview on' }).click()
      await expect(page.getByRole('button', { name: 'Capture photo' })).toBeEnabled()
      await page.getByRole('button', { name: 'Capture photo' }).click()
      const preview = page.getByRole('dialog', { name: 'Review bill photo' })
      const image = preview.getByRole('img', { name: 'Captured bill' })
      await expect(image).toBeVisible()
      const pixels = await image.evaluate(async (element) => {
        const image = element as HTMLImageElement
        await image.decode()
        const canvas = document.createElement('canvas')
        canvas.width = image.naturalWidth
        canvas.height = image.naturalHeight
        const context = canvas.getContext('2d')!
        context.drawImage(image, 0, 0)
        const sample = (x: number) => Array.from(context.getImageData(
          Math.floor(canvas.width * x), Math.floor(canvas.height / 2), 1, 1,
        ).data)
        const response = await fetch(image.src)
        const data = await response.blob()
        const encoded = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve((reader.result as string).split(',')[1])
          reader.onerror = () => reject(reader.error)
          reader.readAsDataURL(data)
        })
        return { left: sample(0.25), right: sample(0.75), encoded }
      })
      expect(pixels.left[mirrored ? 2 : 0]).toBeGreaterThan(200)
      expect(pixels.right[mirrored ? 0 : 2]).toBeGreaterThan(200)
      await preview.getByRole('button', { name: 'Analyse with AI' }).click()
      await expect(preview.getByRole('alert')).toHaveText('This image is not a valid bill.')
      expect(submittedImage).toBe(pixels.encoded)
    })
  }

  test('captures a photo and fills the form after AI analysis', async ({
    page,
  }) => {
    await page.route('**/auth/refresh', (route) => route.fulfill({
      json: {
        access_token: 'test-access-token',
        token_type: 'bearer',
        user: { sub: 'add-txn-user', email: 'addtxn@gmail.com', name: 'Add Txn User' },
      },
    }))
    let requestBody: { images: { data: string }[]; categories: string[] } | undefined
    await page.route('**/money/ai/expense', async (route) => {
      requestBody = route.request().postDataJSON()
      await route.fulfill({ json: {
        is_bill: true, title: 'Lunch', total_amount: '123.45', bill_date: '2026-11-08',
        merchant_name: 'Cafe', summary: 'Meal and drink', category: 'AI test category',
        items: [],
      } })
    })
    await page.goto('/money/expenses/new')
    const category = page.getByRole('combobox', { name: 'Category', exact: true })
    await category.fill('AI test category')
    await page.getByRole('option', { name: 'Add category AI test category' }).click()
    await page.getByRole('button', { name: 'Clear selection' }).click()
    await page.getByRole('button', { name: /Scan a bill/ }).click()
    const dialog = page.getByRole('dialog', { name: 'Scan a bill' })
    await expect(dialog).toBeVisible()
    const camera = dialog.getByLabel('Camera preview')
    const mirror = dialog.getByRole('button', { name: 'Mirror preview on' })
    await expect(camera).toHaveCSS('object-fit', 'cover')
    await expect(mirror).toHaveAttribute('aria-pressed', 'true')
    await expect(camera).toHaveCSS('scale', '-1 1')
    await mirror.click()
    await expect(dialog.getByRole('button', { name: 'Mirror preview off' })).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    await expect(camera).toHaveCSS('scale', 'none')
    await dialog.getByRole('button', { name: 'Mirror preview off' }).click()
    expect(await dialog.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
      true,
    )
    await page.getByRole('button', { name: 'Capture photo' }).click()

    const preview = page.getByRole('dialog', { name: 'Review bill photo' })
    await expect(preview.getByRole('img', { name: 'Captured bill' })).toBeVisible()
    await expect(preview.getByRole('button', { name: 'Add', exact: true })).toHaveCount(0)
    await expect(preview.getByRole('img', { name: 'Captured bill' })).toHaveCSS(
      'transform',
      'none',
    )
    expect(await preview.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
      true,
    )
    await preview.getByRole('button', { name: 'Retake' }).click()
    await page.getByRole('button', { name: 'Capture photo' }).click()
    await preview.getByRole('button', { name: 'Analyse with AI' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    expect(requestBody?.images[0].data.length).toBeGreaterThan(0)
    await expect(page.getByLabel('Title')).toHaveValue('Lunch')
    await expect(page.getByLabel('Amount')).toHaveValue('123.45')
    await page.getByRole('button', { name: 'Date', exact: true }).click()
    await expect(page.getByRole('button', { name: /Sunday, November 8, 2026/ })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Date', exact: true }).click()
    await expect(page.getByLabel('Merchant')).toHaveValue('Cafe')
    await expect(page.getByLabel('Long Description')).toHaveValue('Meal and drink')
    expect(requestBody?.categories).toContain('AI test category')
    await expect(category).toHaveValue('AI test category')
  })

  test('sends multiple uploaded images and reports a non-bill without changing the form', async ({ page }) => {
    await page.route('**/auth/refresh', (route) => route.fulfill({
      json: {
        access_token: 'test-access-token',
        token_type: 'bearer',
        user: { sub: 'add-txn-user', email: 'addtxn@gmail.com', name: 'Add Txn User' },
      },
    }))
    let imageCount = 0
    await page.route('**/money/ai/expense', async (route) => {
      imageCount = route.request().postDataJSON().images.length
      await route.fulfill({ json: { is_bill: false } })
    })
    await page.goto('/money/expenses/new')
    await page.getByLabel('Title').fill('Existing title')
    await page.getByRole('button', { name: 'Scan a bill' }).click()
    await page.getByLabel('Upload a bill photo').setInputFiles([
      'public\\icon-192.png',
      'public\\icon-512.png',
    ])
    const preview = page.getByRole('dialog', { name: 'Review bill photo' })
    await preview.getByRole('button', { name: 'Analyse with AI' }).click()
    await expect(preview.getByRole('alert')).toHaveText('This image is not a valid bill.')
    await expect(page.getByLabel('Title')).toHaveValue('Existing title')
    expect(imageCount).toBe(2)
    await page.route('**/money/ai/expense', (route) =>
      route.fulfill({ status: 502, json: { detail: 'AI provider unavailable' } }),
    )
    await preview.getByRole('button', { name: 'Analyse with AI' }).click()
    await expect(preview.getByRole('alert')).toHaveText('AI provider unavailable')
    await expect(page.getByLabel('Title')).toHaveValue('Existing title')
  })

  test('shows a scanning animation and counts down until the analysis timeout', async ({ page }) => {
    await page.route('**/auth/refresh', (route) => route.fulfill({
      json: {
        access_token: 'test-access-token',
        token_type: 'bearer',
        user: { sub: 'add-txn-user', email: 'addtxn@gmail.com', name: 'Add Txn User' },
      },
    }))
    let releaseRequest: (() => void) | undefined
    await page.route('**/money/ai/expense', async (route) => {
      await new Promise<void>((resolve) => { releaseRequest = resolve })
      await route.fulfill({ json: { is_bill: true, title: 'Late result' } }).catch(() => {})
    })
    await page.goto('/money/expenses/new')
    await page.getByLabel('Title').fill('Existing title')
    await page.getByRole('button', { name: 'Scan a bill' }).click()
    await page.getByLabel('Upload a bill photo').setInputFiles('public\\icon-192.png')
    const preview = page.getByRole('dialog', { name: 'Review bill photo' })
    await page.clock.install()
    await page.clock.pauseAt(Date.now())
    await preview.getByRole('button', { name: 'Analyse with AI' }).click()
    await expect(preview.getByRole('button', { name: 'Analysing…' })).toBeDisabled()
    await expect(preview.locator('.bill-scan-overlay')).toBeVisible()
    await expect(preview.getByRole('status')).toContainText('time limit, not analysis progress')
    await expect(preview.getByText('Analysing your bill · 180s')).toBeVisible()
    await page.emulateMedia({ reducedMotion: 'reduce' })
    expect(await preview.locator('.bill-scan-overlay').evaluate(
      (element) => getComputedStyle(element, '::after').animationName,
    )).toBe('none')
    await page.setViewportSize({ width: 640, height: 360 })
    expect(await preview.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(true)
    const buttonBounds = await preview.getByRole('button', { name: 'Analysing…' }).boundingBox()
    expect(buttonBounds!.y + buttonBounds!.height).toBeLessThanOrEqual(360)
    await expect.poll(() => releaseRequest !== undefined).toBe(true)
    const outline = preview.locator('svg rect[stroke-dashoffset]')
    await expect(outline).toHaveAttribute('stroke-dashoffset', '0')
    await expect(outline).toHaveAttribute('stroke', '#ffab70')
    const dimensions = await outline.evaluate((rect) => {
      const svg = rect.ownerSVGElement!
      const button = svg.parentElement!.querySelector('button')!
      const { width, height } = button.getBoundingClientRect()
      return {
        width,
        height,
        radius: Math.min(parseFloat(getComputedStyle(button).borderTopLeftRadius), width / 2, height / 2),
        outlineWidth: Number(rect.getAttribute('width')),
        outlineHeight: Number(rect.getAttribute('height')),
        outlineRadius: Number(rect.getAttribute('rx')),
      }
    })
    expect(dimensions.outlineWidth).toBeCloseTo(dimensions.width - 3)
    expect(dimensions.outlineHeight).toBeCloseTo(dimensions.height - 3)
    expect(dimensions.outlineRadius).toBeCloseTo(dimensions.radius - 1.5)
    await page.clock.fastForward(10_000)
    await expect(preview.getByText('Analysing your bill · 170s')).toBeVisible()
    await expect(outline).toHaveAttribute('stroke-dashoffset', /^5\.55/)
    await page.clock.fastForward(170_000)
    await expect(preview.getByRole('alert')).toContainText('Analysis timed out')
    await expect(preview.getByRole('button', { name: 'Analyse with AI' })).toBeEnabled()
    await expect(preview.locator('.bill-scan-overlay')).toHaveCount(0)
    releaseRequest?.()
    await expect(page.getByLabel('Title')).toHaveValue('Existing title')
  })

  for (const viewport of [
    { width: 320, height: 568 },
    { width: 375, height: 667 },
    { width: 390, height: 600 },
    { width: 640, height: 360 },
  ]) {
    test(`camera and preview fit ${viewport.width}x${viewport.height}`, async ({ page }) => {
      await page.setViewportSize(viewport)
      await page.goto('/money/expenses/new')
      await page.getByRole('button', { name: 'Scan a bill' }).click()
      const dialog = page.getByRole('dialog', { name: 'Scan a bill' })
      await expect(page.getByRole('button', { name: 'Capture photo' })).toBeEnabled()
      for (const element of [
        dialog,
        page.getByRole('button', { name: 'Capture photo' }),
        page.getByRole('button', { name: 'Cancel' }),
      ]) {
        const box = await element.boundingBox()
        expect(box).not.toBeNull()
        expect(box!.y).toBeGreaterThanOrEqual(0)
        expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
      }
      expect(await dialog.evaluate((element) => element.scrollHeight <= element.clientHeight)).toBe(
        true,
      )
      const expectedCapture = await dialog.getByLabel('Camera preview').evaluate((element) => {
        const video = element as HTMLVideoElement
        const scale = Math.max(
          video.clientWidth / video.videoWidth,
          video.clientHeight / video.videoHeight,
        )
        return {
          width: Math.round(video.clientWidth / scale),
          height: Math.round(video.clientHeight / scale),
        }
      })
      await page.getByRole('button', { name: 'Capture photo' }).click()
      const preview = page.getByRole('dialog', { name: 'Review bill photo' })
      const image = preview.getByRole('img')
      await expect(image).toBeVisible()
      await expect.poll(() => image.evaluate((element) => (element as HTMLImageElement).naturalWidth)).toBe(expectedCapture.width)
      const dimensions = await image.evaluate((element) => {
        const image = element as HTMLImageElement
        return {
          width: image.naturalWidth,
          height: image.naturalHeight,
          displayedWidth: image.clientWidth,
          displayedHeight: image.clientHeight,
          objectFit: getComputedStyle(image).objectFit,
        }
      })
      expect(dimensions.height).toBe(expectedCapture.height)
      expect(dimensions.displayedWidth).toBeGreaterThan(0)
      expect(dimensions.displayedHeight).toBeGreaterThan(0)
      expect(dimensions.objectFit).toBe('contain')
      const scale = Math.min(
        dimensions.displayedWidth / dimensions.width,
        dimensions.displayedHeight / dimensions.height,
      )
      expect(dimensions.displayedWidth - dimensions.width * scale).toBeLessThan(2)
      expect(dimensions.displayedHeight - dimensions.height * scale).toBeLessThan(2)
      expect(
        await preview.evaluate((element) => element.scrollHeight <= element.clientHeight),
      ).toBe(true)
      const analyse = await preview.getByRole('button', { name: 'Analyse with AI' }).boundingBox()
      expect(analyse!.y + analyse!.height).toBeLessThanOrEqual(viewport.height)
      const horizontalFit = await preview.evaluate((dialog) => {
        const dialogBounds = dialog.getBoundingClientRect()
        const buttons = Array.from(dialog.querySelectorAll('button'))
        return buttons.every((button) => {
          const bounds = button.getBoundingClientRect()
          const range = document.createRange()
          range.selectNodeContents(button)
          const content = range.getBoundingClientRect()
          return bounds.left >= dialogBounds.left && bounds.right <= dialogBounds.right
            && content.left >= bounds.left && content.right <= bounds.right
        }) && dialog.scrollWidth <= dialog.clientWidth
      })
      expect(horizontalFit).toBe(true)
    })
  }

  test('shows complete uploaded photos without black letterboxing, including after resizing', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    await page.goto('/money/expenses/new')
    const makePhoto = async (width: number, height: number) => {
      const data = await page.evaluate(({ width, height }) => {
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d')!
        context.fillStyle = '#e84949'
        context.fillRect(0, 0, width, height)
        return canvas.toDataURL('image/png').split(',')[1]
      }, { width, height })
      return Buffer.from(data, 'base64')
    }
    const landscape = await makePhoto(800, 400)
    const portrait = await makePhoto(400, 800)
    await page.getByRole('button', { name: 'Scan a bill' }).click()
    await page.getByLabel('Upload a bill photo').setInputFiles([
      { name: 'landscape.png', mimeType: 'image/png', buffer: landscape },
      { name: 'portrait.png', mimeType: 'image/png', buffer: portrait },
    ])
    const preview = page.getByRole('dialog', { name: 'Review bill photo' })
    for (const viewport of [{ width: 320, height: 568 }, { width: 640, height: 360 }]) {
      await page.setViewportSize(viewport)
      for (const image of await preview.getByRole('img').all()) {
        await expect(image).toBeVisible()
        const result = await image.evaluate(async (element) => {
          const image = element as HTMLImageElement
          await image.decode()
          const { width, height } = image.getBoundingClientRect()
          return {
            width,
            height,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
            background: getComputedStyle(image.parentElement!.parentElement!.parentElement!).backgroundColor,
          }
        })
        expect(result.width).toBeGreaterThan(0)
        expect(result.height).toBeGreaterThan(0)
        expect(result.width / result.height).toBeCloseTo(result.naturalWidth / result.naturalHeight, 1)
        expect(result.background).not.toBe('rgb(0, 0, 0)')
      }
    }
  })

  test('keeps analysis controls within a narrow screen while busy and after an error', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 568 })
    let releaseRequest: (() => void) | undefined
    await page.route('**/money/ai/expense', async (route) => {
      await new Promise<void>((resolve) => { releaseRequest = resolve })
      await route.fulfill({ status: 502, json: { detail: 'AI provider unavailable' } })
    })
    await page.goto('/money/expenses/new')
    await page.getByRole('button', { name: 'Scan a bill' }).click()
    await page.getByLabel('Upload a bill photo').setInputFiles('public\\icon-192.png')
    const preview = page.getByRole('dialog', { name: 'Review bill photo' })
    await preview.getByRole('button', { name: 'Analyse with AI' }).click()
    const busyButton = preview.getByRole('button', { name: 'Analysing…' })
    await expect(busyButton).toBeDisabled()
    await expect.poll(() => releaseRequest !== undefined).toBe(true)
    const fits = async () => preview.evaluate((dialog) => {
      const bounds = dialog.getBoundingClientRect()
      return dialog.scrollWidth <= dialog.clientWidth && Array.from(dialog.querySelectorAll('button')).every((button) => {
        const box = button.getBoundingClientRect()
        return box.left >= bounds.left && box.right <= bounds.right && box.bottom <= bounds.bottom
      })
    })
    expect(await fits()).toBe(true)
    releaseRequest!()
    await expect(preview.getByRole('alert')).toHaveText('AI provider unavailable')
    await expect(preview.getByRole('button', { name: 'Analyse with AI' })).toBeEnabled()
    expect(await fits()).toBe(true)
  })
})
