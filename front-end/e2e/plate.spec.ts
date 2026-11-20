import { expect, test, type Page } from '@playwright/test'
import { fakeSignIn } from './helpers'

async function openPlate(page: Page) {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/auth/refresh', (route) => route.abort())
  await page.route('**/auth/login', (route) => route.abort())
  await page.route('**/auth/me', (route) =>
    route.fulfill({ json: { role: 'owner', entitlements: ['money', 'food', 'plate'] } }),
  )
  await fakeSignIn(page)
  await page.goto('/plate/today')
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
}

const nav = (page: Page) => page.getByRole('navigation', { name: 'MyPlate navigation' })
const sheet = (page: Page) => page.getByRole('dialog')

test('Today brings every kitchen together and ticks prep', async ({ page }) => {
  await openPlate(page)
  const plate = page.getByRole('region', { name: 'On your plate today' })
  await expect(plate.getByText('Overnight oats')).toBeVisible()
  await expect(plate.getByText('Paneer tikka wrap')).toBeVisible()
  await expect(plate.getByText('Thai green curry')).toBeVisible()

  await expect(page.getByText('2/6 done')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Slice bananas into a box' }).click()
  await expect(page.getByText('3/6 done')).toBeVisible()
  await expect(page.getByText(/One notification at 8:00 PM/)).toBeVisible()
})

test('Plan and Cart share the kitchen choice, and solo mode hides shared fields', async ({
  page,
}) => {
  await openPlate(page)
  await nav(page).getByRole('link', { name: 'Plan' }).click()
  // Home is the default kitchen.
  await expect(page.getByRole('button', { name: /Kitchen: Home/ })).toBeVisible()

  await page.getByRole('button', { name: /Switch kitchen/ }).click()
  await sheet(page)
    .getByRole('button', { name: /My Kitchen.*meals? this week/ })
    .click()
  await expect(page.getByRole('button', { name: /Kitchen: My Kitchen/ })).toBeVisible()

  await nav(page).getByRole('link', { name: 'Cart' }).click()
  await expect(page.getByRole('button', { name: /Kitchen: My Kitchen/ })).toBeVisible()
  await expect(page.getByText(/is shopping now/)).toHaveCount(0)

  await page.getByRole('textbox', { name: 'Add an item to My Kitchen' }).fill('Paneer')
  await page.keyboard.press('Enter')
  await expect(
    page.getByRole('region', { name: 'Dairy & Eggs' }).getByText('Paneer', { exact: true }),
  ).toBeVisible()

  await nav(page).getByRole('button', { name: 'Create' }).click()
  await expect(sheet(page).getByRole('button', { name: /Plan with someone/ })).toBeVisible()
  await sheet(page)
    .getByRole('button', { name: /Plan a meal/ })
    .click()
  await expect(sheet(page).getByText('Guests', { exact: true })).toBeVisible()
  await expect(sheet(page).getByRole('button', { name: 'Eating out' })).toBeVisible()
  await expect(sheet(page).getByRole('button', { name: 'Together' })).toHaveCount(0)
})

test('a shared meal shows who is eating and lands in the week', async ({ page }) => {
  await openPlate(page)
  await nav(page).getByRole('link', { name: 'Plan' }).click()
  await expect(page.getByText('Leftovers', { exact: true })).toBeVisible()

  await nav(page).getByRole('button', { name: 'Create' }).click()
  await sheet(page)
    .getByRole('button', { name: /Plan a meal/ })
    .click()
  await expect(sheet(page).getByText("Who's eating")).toBeVisible()
  await sheet(page).getByRole('textbox', { name: 'Main dish' }).fill('Masala khichdi')
  await sheet(page).getByRole('button', { name: 'Together' }).click()
  await sheet(page).getByRole('button', { name: '+ Add task' }).click()
  await sheet(page).getByRole('textbox', { name: 'Prep task 1' }).fill('Soak moong dal')
  await sheet(page).getByRole('button', { name: 'Save', exact: true }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByText('Masala khichdi')).toBeVisible()
})

test('Kitchens pins My Kitchen and joins with a code', async ({ page }) => {
  await openPlate(page)
  await nav(page).getByRole('link', { name: 'Kitchens' }).click()
  await expect(page.getByText('Personal · private', { exact: false })).toBeVisible()
  await expect(page.getByText('Default', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Join with code' }).click()
  await sheet(page).getByRole('textbox', { name: 'Invite code' }).fill('office24')
  await sheet(page).getByRole('button', { name: 'Join kitchen' }).click()
  await expect(page).toHaveURL(/\/plate\/plan$/)
  await expect(page.getByRole('button', { name: /Kitchen: Office Lunch/ })).toBeVisible()
})

test('going live in the cart tells the kitchen you are shopping', async ({ page }) => {
  await openPlate(page)
  await nav(page).getByRole('link', { name: 'Cart' }).click()
  await expect(page.getByText(/Maya is shopping now/)).toBeVisible()

  const goLive = page.getByRole('region', { name: 'Go live' })
  await expect(goLive).toContainText('Going to the store?')
  await expect(goLive).toContainText("Go live so Maya knows you're shopping")
  await goLive.getByRole('button', { name: 'Go live' }).click()

  const live = page.getByRole('region', { name: "You're shopping" })
  await expect(live).toContainText('LIVE')
  await expect(live).toContainText('Maya can see you')

  // Elsewhere in MyPlate a pill keeps it visible, and stops it.
  await nav(page).getByRole('link', { name: 'Kitchens' }).click()
  await expect(page.getByText("You're shopping").first()).toBeVisible()
  const pill = page.getByRole('status').filter({ hasText: "You're shopping" })
  await pill.getByRole('button', { name: 'Stop' }).click()
  await expect(pill).toHaveCount(0)
})
