import type { Page } from '@playwright/test'

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')

/** Pretend to be signed in (against the test API, which accepts these fake tokens). */
export async function fakeSignIn(
  page: Page,
  who = { sub: '1', email: 'me@gmail.com', name: 'Test User' },
) {
  const token = `h.${b64({ ...who, exp: Math.floor(Date.now() / 1000) + 3600 })}.s`
  await page.addInitScript((t) => localStorage.setItem('exptracker.idtoken', t), token)
}

export async function chooseOption(page: Page, label: string, option: string) {
  await page.getByLabel(label).click()
  await page.getByRole('option', { name: option, exact: true }).click()
}
