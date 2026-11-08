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
  test('captures a photo, shows it in a popup, and dismisses on Analyse with AI', async ({
    page,
  }) => {
    await page.goto('/money/expenses/new')
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
    await expect(page.getByLabel('Title')).toBeVisible()
  })

  for (const viewport of [
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
        }
      })
      expect(dimensions.height).toBe(expectedCapture.height)
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
    })
  }
})
