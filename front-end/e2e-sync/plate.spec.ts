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
  await sheet(page).getByRole('button', { name: 'Add prep step' }).click()
  await sheet(page).getByRole('textbox', { name: 'Prep step 1' }).fill('Soak rajma')
  await sheet(page).getByRole('button', { name: 'Save meal' }).click()
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
  const code = sheet(a).getByTestId('invite-code')
  await expect(code).toHaveText(/^[A-Za-z0-9]{6}$/)
  const joinCode = (await code.textContent())!.trim()
  await sheet(a).getByRole('button', { name: 'Close' }).click()

  // Bob joins with the code.
  await nav(b).getByRole('link', { name: 'Kitchens' }).click()
  await b.getByRole('button', { name: 'Join with code' }).click()
  await sheet(b).getByRole('textbox', { name: 'Invite code' }).fill(joinCode)
  await sheet(b).getByRole('button', { name: 'Join kitchen' }).click()
  await expect(b.getByRole('button', { name: /Kitchen: Home/ })).toBeVisible()

  // Nothing to buy yet, so nobody is asked to go to the store.
  await nav(b).getByRole('link', { name: 'Cart' }).click()
  await expect(b.getByRole('region', { name: 'Go live' })).toHaveCount(0)

  // Alice adds something; Bob is offered "Go live" and goes; Alice sees it.
  const live = { timeout: 25_000 }
  await nav(a).getByRole('link', { name: 'Cart' }).click()
  await a.getByRole('textbox', { name: 'Add an item to Home' }).fill('Tomatoes')
  await a.keyboard.press('Enter')
  await b
    .getByRole('region', { name: 'Go live' })
    .getByRole('button', { name: 'Go live' })
    .click(live)
  const shopping = b.getByRole('region', { name: "You're shopping" })
  await expect(shopping).toBeVisible()
  await expect(shopping).not.toContainText('can see you')
  await a.reload()
  await expect(a.getByText(/Bob is shopping now/)).toBeVisible()

  // Changes save on the phone at once and reach the others on the next live refresh.
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
  await page.getByRole('combobox', { name: 'Reminder time' }).click()
  await page.getByRole('option', { name: '9:00 PM' }).click()
  await page.reload()
  await expect(page.getByRole('combobox', { name: 'Reminder time' })).toContainText('9:00 PM')

  await page
    .getByRole('link', { name: /My Kitchen/ })
    .first()
    .click()
  await expect(page.getByText('Pre-prep reminder')).toHaveCount(0)
})

test('invite by email: the invite waits on their Kitchens page', async ({ browser }) => {
  const carol = { sub: 'g-plate-carol', email: 'carol.plate@gmail.com', name: 'Carol C' }
  const dave = { sub: 'g-plate-dave', email: 'dave.plate@gmail.com', name: 'Dave D' }
  const a = await (await browser.newContext()).newPage()
  await open(a, carol)
  await nav(a).getByRole('link', { name: 'Kitchens' }).click()
  await expect(a.getByText('Plan with someone')).toHaveCount(0)
  await a.getByRole('button', { name: '+ New kitchen' }).click()
  await sheet(a).getByRole('textbox', { name: 'Name' }).fill('Flat')
  await sheet(a).getByRole('button', { name: 'Create kitchen' }).click()
  await sheet(a).getByRole('textbox', { name: 'Invite by email' }).fill('Dave.Plate@gmail.com')
  await sheet(a).getByRole('button', { name: 'Invite', exact: true }).click()
  await expect(sheet(a)).toHaveCount(0)

  const b = await (await browser.newContext()).newPage()
  await open(b, dave)
  await nav(b).getByRole('link', { name: 'Kitchens' }).click()
  await expect(b.getByText(/Carol invited you to/)).toBeVisible()
  await b.getByRole('button', { name: 'Accept' }).click()
  await expect(b.getByRole('region', { name: 'Shared kitchens' })).toContainText('Flat')
  await expect(b.getByText(/Carol invited you to/)).toHaveCount(0)
})

test('My Kitchen is view-only; shared kitchen settings change at once', async ({ page }) => {
  const erin = { sub: 'g-plate-erin', email: 'erin.plate@gmail.com', name: 'Erin E' }
  await open(page, erin)
  await nav(page).getByRole('link', { name: 'Kitchens' }).click()

  // My Kitchen: every meal, nothing to edit.
  await page
    .getByRole('link', { name: /My Kitchen/ })
    .first()
    .click()
  const details = page.getByRole('region', { name: 'My Kitchen details' })
  await expect(details).toContainText('Breakfast')
  await expect(details).toContainText('Snacks')
  await expect(page.getByRole('textbox', { name: 'Name' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Snacks' })).toHaveCount(0)

  await nav(page).getByRole('link', { name: 'Kitchens' }).click()
  await page.getByRole('button', { name: '+ New kitchen' }).click()
  await sheet(page).getByRole('textbox', { name: 'Name' }).fill('Studio')
  await sheet(page).getByRole('button', { name: 'Create kitchen' }).click()
  await sheet(page).getByRole('button', { name: 'Close' }).click()
  await nav(page).getByRole('link', { name: 'Kitchens' }).click()
  await page
    .getByRole('link', { name: /Studio/ })
    .first()
    .click()
  const snacks = page.getByRole('button', { name: 'Snacks' })
  await expect(snacks).toHaveAttribute('aria-pressed', 'false')

  // Hold the save on the server; the screen doesn't wait for it.
  let release: () => void = () => {}
  const held = new Promise<void>((resolve) => (release = resolve))
  await page.route('**/api/v1/plate/kitchens/*', async (route) => {
    if (route.request().method() !== 'PATCH') return route.fallback()
    await held
    await route.fallback()
  })
  await snacks.click()
  await expect(snacks).toHaveAttribute('aria-pressed', 'true', { timeout: 1000 })

  release()
  await page.unroute('**/api/v1/plate/kitchens/*')
  // Once sent, a fresh device sees it too.
  const other = await (await page.context().browser()!.newContext()).newPage()
  await open(other, erin)
  await nav(other).getByRole('link', { name: 'Kitchens' }).click()
  await other
    .getByRole('link', { name: /Studio/ })
    .first()
    .click()
  await expect(other.getByRole('button', { name: 'Snacks' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
})

test('one Save plans the meal with its prep and cart items; leftovers are a tick away', async ({
  page,
}) => {
  const finn = { sub: 'g-plate-finn', email: 'finn.plate@gmail.com', name: 'Finn F' }
  await open(page, finn)
  await nav(page).getByRole('link', { name: 'Plan' }).click()
  const today = new Date()
  const dayTab = (d: Date) =>
    page.getByRole('tab', {
      name: d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }),
    })
  await dayTab(today).click()

  await page.getByRole('button', { name: 'Add breakfast' }).click()
  const form = sheet(page)
  await expect(form.getByRole('heading', { name: 'Plan a meal' })).toBeVisible()
  await form.getByRole('textbox', { name: 'Main dish' }).fill('Paneer paratha')
  await form.getByRole('button', { name: 'Add side dish' }).click()
  await form.getByRole('textbox', { name: 'Side dish 1' }).fill('Curd')
  await form.getByRole('button', { name: 'Add item to buy' }).click()
  await form.getByRole('textbox', { name: 'Item to buy 1' }).fill('Paneer 400g')
  await page.keyboard.press('Enter')
  await form.getByRole('textbox', { name: 'Item to buy 2' }).fill('Atta')
  await expect(form.getByText('Saves the meal · 2 to buy')).toBeVisible()
  await form.getByRole('button', { name: 'Save meal' }).click()
  await expect(form).toHaveCount(0)

  // Both items are in the cart, linked to the meal, and the Cart tab counts them.
  await expect(nav(page).getByRole('link', { name: /Cart/ })).toContainText('2')
  await nav(page).getByRole('link', { name: /Cart/ }).click()
  await expect(page.getByText('Paneer 400g')).toBeVisible()
  await expect(page.getByText('Atta')).toBeVisible()

  // Lunch: tick "Eat leftovers" and pick breakfast; nothing to cook or buy.
  await nav(page).getByRole('link', { name: 'Plan' }).click()
  await dayTab(today).click()
  await page.getByRole('button', { name: 'Add lunch' }).click()
  await form.getByRole('checkbox', { name: 'Eat leftovers' }).click()
  await expect(form.getByRole('radio', { name: /Paneer paratha/ })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await expect(form.getByRole('region', { name: 'To buy' })).toHaveCount(0)
  await form.getByRole('button', { name: 'Save meal' }).click()
  await expect(page.getByText('Paneer paratha (leftovers)')).toBeVisible()
})
