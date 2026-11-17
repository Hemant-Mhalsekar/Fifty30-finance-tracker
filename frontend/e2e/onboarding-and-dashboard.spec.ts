import { expect, test } from '@playwright/test'
import { resetApi } from './helpers'

test('a new user is sent to onboarding from any URL and sees the split before saving', async ({ page, request }) => {
  await resetApi(request, { onboarded: false })
  await page.goto('/expenses')
  await expect(page).toHaveURL(/\/onboarding$/)

  await page.getByLabel('Monthly take-home salary').fill('50,000')
  await expect(page.getByText('₹25,000.00')).toBeVisible() // needs, 50%
  await expect(page.getByText('₹15,000.00')).toBeVisible() // wants, 30%
  await page.getByLabel(/Pay day/).selectOption('25')
  await page.getByRole('button', { name: 'Start tracking' }).click()

  await expect(page.getByText('No expenses logged yet.')).toBeVisible()
  await expect(page).toHaveURL(/\/$/)
})

test('onboarding rejects a salary with too many decimals', async ({ page, request }) => {
  await resetApi(request, { onboarded: false })
  await page.goto('/')
  await page.getByLabel('Monthly take-home salary').fill('50000.123')
  await page.getByRole('button', { name: 'Start tracking' }).click()
  await expect(page.getByRole('alert')).toContainText('at most 2 decimals')
})

test('adding expenses updates the dashboard and flags overspending', async ({ page, request }) => {
  await resetApi(request)
  await page.goto('/add')

  const amount = page.getByLabel('Amount')
  await expect(amount).toBeFocused()
  await amount.fill('30000')
  const rent = page.getByRole('button', { name: 'Rent', exact: true })
  await rent.click()
  await page.getByLabel('Description').fill('November rent')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByRole('status')).toContainText('Saved ₹30,000.00 in Rent')

  // Ready for the next entry: amount cleared, category kept.
  await expect(amount).toHaveValue('')
  await expect(rent).toHaveAttribute('aria-pressed', 'true')

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Dashboard' }).click()
  const needs = page.locator('.budget-row', { hasText: 'Needs' })
  await expect(needs).toHaveClass(/over/)
  await expect(needs).toContainText('Over by')
})

test('Other needs a type, and bad amounts are rejected', async ({ page, request }) => {
  await resetApi(request)
  await page.goto('/add')
  await page.getByLabel('Amount').fill('1200.5')
  await page.getByRole('button', { name: 'Other', exact: true }).click()
  await page.getByLabel('Description').fill('Gift')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByRole('alert')).toContainText('need, want or investment')

  await page.getByLabel('Want').check()
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByRole('status')).toContainText('Saved ₹1,200.50 in Other')

  await page.getByLabel('Amount').fill('1.234')
  await page.getByLabel('Description').fill('Too precise')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByRole('alert')).toContainText('at most 2 decimals')
})

test('the dashboard moves between cycles and stops at the first one', async ({ page, request }) => {
  await resetApi(request)
  await page.goto('/')
  await expect(page.getByText('Left to spend on needs and wants')).toBeVisible()
  const next = page.getByRole('button', { name: 'Next cycle' })
  await expect(next).toBeDisabled()

  await page.getByRole('button', { name: 'Previous cycle' }).click()
  await expect(page.locator('.cycle-header').getByText('Past cycle')).toBeVisible()
  await page.getByRole('button', { name: 'Previous cycle' }).click()
  await expect(page.getByText('There is no earlier cycle.')).toBeVisible()

  await next.click()
  await expect(page.getByText('Left to spend on needs and wants')).toBeVisible()
})

test('deep links survive a reload and unknown paths go home', async ({ page, request }) => {
  await resetApi(request)
  await page.goto('/settings')
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await page.goto('/no-such-page')
  await expect(page).toHaveURL(/\/$/)
})
