import { expect, test, type Page } from '@playwright/test'
import { fakeSignIn } from '../e2e/helpers'

// Full stack: the real MyPlate API on a blank SQLite database.
const alice = { sub: 'g-plate-alice', email: 'alice.plate@gmail.com', name: 'Alice A' }
const bob = { sub: 'g-plate-bob', email: 'bob.plate@gmail.com', name: 'Bob B' }

const nav = (page: Page) => page.getByRole('navigation', { name: 'My Plate navigation' })
const sheet = (page: Page) => page.getByRole('dialog')

async function open(page: Page, who: typeof alice) {
  await page.setViewportSize({ width: 390, height: 844 })
  await fakeSignIn(page, who)
  await page.goto('/plate/today')
  await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
}

test('solo: plan tomorrow with prep, tick it on Today, and fill the cart', async ({ page }) => {
  await open(page, alice)
  await expect(page.getByText('Nothing planned for today yet.')).toBeVisible()

  // A new user starts on My Kitchen.
  await nav(page).getByRole('link', { name: 'Plan' }).click()
  await expect(page.getByRole('button', { name: /Kitchen: My Kitchen/ })).toBeVisible()
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  if (tomorrow.getDay() === 1) await page.getByRole('button', { name: 'Next week' }).click()
  await page
    .getByRole('tab', {
      name: tomorrow.toLocaleDateString('en-IN', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    })
    .click()
  await page.getByRole('button', { name: 'Add dinner' }).click()
  await sheet(page).getByRole('textbox', { name: 'Main dish' }).fill('Rajma chawal')
  await sheet(page).getByRole('button', { name: '+ Add task' }).click()
  await sheet(page).getByRole('textbox', { name: 'Prep task 1' }).fill('Soak rajma')
  await sheet(page).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByText('Rajma chawal')).toBeVisible()

  await nav(page).getByRole('link', { name: 'Today' }).click()
  await expect(page.getByText('0/1 done')).toBeVisible()
  await page.getByRole('checkbox', { name: 'Soak rajma' }).click()
  await expect(page.getByText('1/1 done')).toBeVisible()

  await nav(page).getByRole('link', { name: 'Cart' }).click()
  await page.getByRole('textbox', { name: 'Add an item to My Kitchen' }).fill('Paneer (400g)')
  await page.keyboard.press('Enter')
  await expect(page.getByRole('region', { name: 'Dairy & Eggs' })).toContainText('Paneer (400g)')

  // Everything is on the server, so it survives a reload.
  await page.reload()
  await expect(page.getByRole('region', { name: 'Dairy & Eggs' })).toContainText('Paneer (400g)')
  await nav(page).getByRole('link', { name: 'Today' }).click()
  await expect(page.getByText('1/1 done')).toBeVisible()
})

test('shared: create a kitchen, join by code, and see each other shopping', async ({ browser }) => {
  test.setTimeout(90_000)
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  await open(a, alice)
  await open(b, bob)

  // Alice starts a kitchen; MyPlate hands her the invite step.
  await nav(a).getByRole('link', { name: 'Kitchens' }).click()
  await a.getByRole('button', { name: '+ New kitchen' }).click()
  await sheet(a).getByRole('textbox', { name: 'Name' }).fill('Home')
  await sheet(a).getByRole('button', { name: 'Create kitchen' }).click()
  await sheet(a).getByRole('button', { name: 'Show invite code' }).click()
  const code = (await sheet(a)
    .getByText(/^[A-Z2-9]{8}$/)
    .textContent())!.trim()
  await sheet(a).getByRole('button', { name: 'Close' }).click()

  // Bob joins with the code.
  await nav(b).getByRole('link', { name: 'Kitchens' }).click()
  await b.getByRole('button', { name: 'Join with code' }).click()
  await sheet(b).getByRole('textbox', { name: 'Invite code' }).fill(code.toLowerCase())
  await sheet(b).getByRole('button', { name: 'Join kitchen' }).click()
  await expect(b.getByRole('button', { name: /Kitchen: Home/ })).toBeVisible()

  // Bob goes live in the cart; Alice sees it.
  await nav(b).getByRole('link', { name: 'Cart' }).click()
  await b.getByRole('region', { name: 'Go live' }).getByRole('button', { name: 'Go live' }).click()
  await expect(b.getByRole('region', { name: "You're shopping" })).toContainText(
    'Alice can see you',
  )

  await nav(a).getByRole('link', { name: 'Cart' }).click()
  await a.reload()
  await expect(a.getByText(/Bob is shopping now/)).toBeVisible()
  await a.getByRole('textbox', { name: 'Add an item to Home' }).fill('Tomatoes')
  await a.keyboard.press('Enter')

  // Changes save on the phone at once and reach the others on the next live refresh.
  const live = { timeout: 25_000 }
  await b.getByRole('checkbox', { name: 'Tomatoes' }).click(live)
  await expect(b.getByRole('region', { name: "You're shopping" })).toContainText('Done shopping?')
  await expect(a.getByRole('region', { name: 'In the basket' })).toContainText('Tomatoes', live)
})

test('local-first: changes save offline and a reload shows them before the server answers', async ({
  browser,
}) => {
  const context = await browser.newContext()
  const a = await context.newPage()
  await open(a, alice)
  await nav(a).getByRole('link', { name: 'Cart' }).click()
  const dairy = a.getByRole('region', { name: 'Dairy & Eggs' })

  // Offline, the item is saved and shown at once.
  await context.setOffline(true)
  await a.getByRole('textbox', { name: 'Add an item to My Kitchen' }).fill('Paneer (400g)')
  await a.keyboard.press('Enter')
  await expect(dairy).toContainText('Paneer (400g)')

  // Back online it syncs in the background; another device of Alice's gets it.
  await context.setOffline(false)
  const phone = await (await browser.newContext()).newPage()
  await open(phone, alice)
  await nav(phone).getByRole('link', { name: 'Cart' }).click()
  await expect(phone.getByRole('region', { name: 'Dairy & Eggs' })).toContainText('Paneer (400g)')

  // With the server stalled, a reload still shows MyPlate from the phone's own copy.
  await a.route('**/api/v1/sync/plate/pull**', () => undefined)
  await a.reload()
  await expect(dairy).toContainText('Paneer (400g)')
})

test('the prep reminder lives on the Kitchens page, not on Today or in one kitchen', async ({
  page,
}) => {
  await open(page, alice)
  await expect(page.getByText('Remind me with the full checklist')).toHaveCount(0)

  await nav(page).getByRole('link', { name: 'Kitchens' }).click()
  await expect(page.getByText('Pre-prep reminder')).toBeVisible()
  await page.getByRole('combobox', { name: 'Reminder time' }).selectOption('21:00')
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Reminder time' })).toHaveValue('21:00')

  await page
    .getByRole('link', { name: /My Kitchen/ })
    .first()
    .click()
  await expect(page.getByText('Pre-prep reminder')).toHaveCount(0)
})
