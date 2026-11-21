import { expect, test } from '@playwright/test'
import { fakeSignIn } from '../e2e/helpers'

const alice = { sub: 'g-code-alice', email: 'alice.code@gmail.com', name: 'Alice A' }
const bob = { sub: 'g-code-bob', email: 'bob.code@gmail.com', name: 'Bob B' }

test('a money group shares a join code and someone uninvited joins with it', async ({
  browser,
}) => {
  const a = await (await browser.newContext()).newPage()
  const b = await (await browser.newContext()).newPage()
  await fakeSignIn(a, alice)
  await fakeSignIn(b, bob)

  await a.goto('/money/groups')
  await a.getByRole('button', { name: 'Add group' }).click()
  await a.getByPlaceholder('Group name').fill('Flat bills')
  await a.getByRole('button', { name: 'Create Group' }).click()
  await a.getByText('Flat bills').click()
  await a.getByRole('button', { name: 'Members' }).click()
  await a.getByRole('button', { name: 'Show join code' }).click()
  const shown = a.getByTestId('group-join-code')
  await expect(shown).toHaveText(/^[A-Za-z0-9]{6}$/)
  const code = (await shown.textContent())!.trim()

  await b.goto('/money/groups')
  await b.getByRole('textbox', { name: 'Group code' }).fill(code)
  await b.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(b).toHaveURL(/\/money\/groups\/[0-9a-f-]+$/)
  await b.goto('/money/groups')
  await expect(b.getByText('Flat bills')).toBeVisible()

  await a.reload()
  await a.getByRole('button', { name: 'Members' }).click()
  await expect(a.getByText(/bob\.code@gmail\.com/)).toBeVisible()
})
