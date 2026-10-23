import { expect, test } from '@playwright/test'
import { fakeSignIn } from '../e2e/helpers'

const alice = { sub: 'g-alice', email: 'alice@gmail.com', name: 'Alice A' }
const bob = { sub: 'g-bob', email: 'bob@gmail.com', name: 'Bob B' }

test('create group, invite by email, join, split expense, see balances, settle', async ({
  browser,
}) => {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  await fakeSignIn(a, alice)
  await fakeSignIn(b, bob)

  // Bob signs in once so his profile exists
  await b.goto('/groups')
  await expect(b.getByText('No groups yet')).toBeVisible()

  // Alice creates a group and adds Bob by email
  await a.goto('/groups')
  await a.getByRole('button', { name: 'Add group' }).click()
  await a.getByPlaceholder('Group name').fill('Goa Trip')
  await a.getByRole('button', { name: 'Create Group' }).click()
  await a.getByText('Goa Trip').click()
  await a.getByRole('button', { name: 'Members' }).click()
  await a.getByPlaceholder('Add by email').fill('Bob@gmail.com')
  await a.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(a.getByText('bob@gmail.com', { exact: true })).toBeVisible()

  // Bob sees the invitation and joins; his Google name is captured
  await b.goto('/groups')
  await b.getByRole('button', { name: 'Join' }).click()
  await expect(b.getByText('Goa Trip')).toBeVisible()
  await b.getByText('Goa Trip').click()
  await b.getByRole('button', { name: 'Members' }).click()
  await expect(b.getByText('Bob B')).toBeVisible()

  // Alice adds a 600 expense split equally
  await a.getByRole('button', { name: 'Expenses' }).click()
  await a.getByRole('button', { name: 'Add Expense' }).click()
  await a.getByPlaceholder('0').fill('600')
  await a.getByPlaceholder('Title').fill('Hotel')
  await a.getByRole('button', { name: 'Save and Split' }).click()
  await expect(a.getByText('Hotel')).toBeVisible()

  // Bob owes 300
  await b.reload()
  await b.getByRole('button', { name: 'Balances' }).click()
  await expect(b.getByText('You owe Alice A')).toBeVisible()
  await expect(b.getByText('₹300.00').first()).toBeVisible()

  // Bob pays back 100
  await b.getByLabel('Pay to').selectOption({ label: 'Alice A' })
  await b.getByPlaceholder('0').fill('100')
  await b.getByRole('button', { name: 'Record Settlement' }).click()
  await expect(b.getByText('₹200.00').first()).toBeVisible()

  await b.getByRole('button', { name: 'Members' }).click()
  b.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    expect(dialog.message()).toContain('Goa Trip')
    await dialog.accept()
  })
  await b.getByRole('button', { name: 'Leave Group' }).click()
  await expect(b).toHaveURL(/\/groups$/)
  await expect(b.getByText('No groups yet')).toBeVisible()

  await a.reload()
  await a.getByRole('button', { name: 'Members' }).click()
  await expect(a.getByText('bob@gmail.com · member · Left')).toBeVisible()
  await a.getByRole('button', { name: 'Invite again' }).click()
  await expect(a.getByText('Invited', { exact: true })).toBeVisible()

  a.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('confirm')
    expect(dialog.message()).toContain('Goa Trip')
    await dialog.accept()
  })
  await a.getByRole('button', { name: 'Delete Group' }).click()
  await expect(a).toHaveURL(/\/groups$/)
  await expect(a.getByText('No groups yet')).toBeVisible()
})
