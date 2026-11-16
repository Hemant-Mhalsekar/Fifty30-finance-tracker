import { expect, test } from '@playwright/test'
import { resetApi } from './helpers'

// Shows the login form even though the mock API would restore a session.
async function loggedOut(page: import('@playwright/test').Page) {
  await page.route('**/api/auth/refresh', (route) => route.fulfill({ status: 401, body: '{}' }))
}

test.beforeEach(async ({ request }) => {
  await resetApi(request)
})

test('the password can be shown and hidden', async ({ page }) => {
  await loggedOut(page)
  await page.goto('/')
  const password = page.getByLabel('Password', { exact: true })
  await password.fill('secret-123')
  await expect(password).toHaveAttribute('type', 'password')

  await page.getByRole('button', { name: 'Show password' }).click()
  await expect(password).toHaveAttribute('type', 'text')
  await page.getByRole('button', { name: 'Hide password' }).click()
  await expect(password).toHaveAttribute('type', 'password')
})

test('forgot password sends a link and gives the same answer for any email', async ({ page }) => {
  await loggedOut(page)
  await page.goto('/')
  await page.getByLabel('Email').fill('someone@example.com')
  await page.getByRole('button', { name: 'Forgot password?' }).click()

  // The email typed on the login form carries over.
  await expect(page.getByLabel('Email')).toHaveValue('someone@example.com')
  await page.getByRole('button', { name: 'Send reset link' }).click()
  await expect(page.getByRole('status')).toContainText('If an account exists for someone@example.com')

  await page.getByRole('button', { name: 'Back to log in' }).click()
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
})

test('a reset link sets a new password once, then ends on the login form', async ({ page }) => {
  await loggedOut(page)
  await page.goto('/reset-password?token=valid-reset-token')
  // The token is taken out of the address bar.
  await expect(page).toHaveURL(/\/reset-password$/)

  await page.getByLabel('New password', { exact: true }).fill('new-password-1')
  await page.getByLabel('Repeat new password').fill('different-1')
  await page.getByRole('button', { name: 'Save new password' }).click()
  await expect(page.getByRole('alert')).toContainText('do not match')

  await page.getByLabel('Repeat new password').fill('new-password-1')
  await page.getByRole('button', { name: 'Save new password' }).click()
  await expect(page.getByRole('status')).toContainText('Your password is updated')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

test('a used or made-up link explains what to do', async ({ page }) => {
  await loggedOut(page)
  await page.goto('/reset-password?token=made-up')
  await page.getByLabel('New password', { exact: true }).fill('new-password-1')
  await page.getByLabel('Repeat new password').fill('new-password-1')
  await page.getByRole('button', { name: 'Save new password' }).click()
  await expect(page.getByRole('alert')).toContainText('invalid or has expired')
  await page.getByRole('button', { name: 'Request a new link' }).click()
  await expect(page.getByRole('heading', { name: 'Log in' })).toBeVisible()
})

test('opening the reset page without a token says the link is missing', async ({ page }) => {
  await loggedOut(page)
  await page.goto('/reset-password')
  await expect(page.getByRole('heading', { name: 'Reset link missing' })).toBeVisible()
})
