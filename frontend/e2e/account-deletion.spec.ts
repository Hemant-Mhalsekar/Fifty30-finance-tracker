import { expect, test } from '@playwright/test'
import { resetApi } from './helpers'

test.beforeEach(async ({ request }) => {
  await resetApi(request)
})

// IST date `days` from today, as the app formats it ("25 Nov 2026").
function istDate(days: number): string {
  const d = new Date(Date.now() + 5.5 * 3600_000 + days * 86_400_000)
  return new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' }).format(
    d,
  )
}

test('deleting the account needs the password, signs out, and logging in again keeps it', async ({ page }) => {
  await page.goto('/settings')
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Delete account' }) })
  await card.getByRole('button', { name: 'Delete account…' }).click()

  await card.getByRole('button', { name: 'Delete my account' }).click()
  await expect(card.getByRole('alert')).toHaveText('Enter your password')

  await card.getByLabel('Your password').fill('not-my-password')
  await card.getByRole('button', { name: 'Delete my account' }).click()
  await expect(card.getByRole('alert')).toHaveText('Password is incorrect')

  await card.getByLabel('Your password').fill('password123')
  await card.getByRole('button', { name: 'Delete my account' }).click()

  // Signed out, with the date and how to change your mind.
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
  await expect(page.getByRole('status')).toContainText(`will be deleted on ${istDate(7)}`)

  await page.getByLabel('Email').fill('test@example.com')
  await page.getByLabel('Password', { exact: true }).fill('password123')
  await page.getByRole('button', { name: 'Log in' }).click()
  const flash = page.locator('.flash')
  await expect(flash).toContainText('Your account will not be deleted.')
  await flash.getByRole('button', { name: 'OK' }).click()
  await expect(flash).toBeHidden()
})

test('"Keep my account" closes the form without asking the server', async ({ page }) => {
  await page.goto('/settings')
  const card = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Delete account' }) })
  await card.getByRole('button', { name: 'Delete account…' }).click()
  await card.getByLabel('Your password').fill('password123')
  await card.getByRole('button', { name: 'Keep my account' }).click()
  await expect(card.getByLabel('Your password')).toBeHidden()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
})
