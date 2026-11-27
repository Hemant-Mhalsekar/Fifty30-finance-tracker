import { expect, test, type Page } from '@playwright/test'
import { ordinal } from '../src/recurring'
import { resetApi } from './helpers'

test.beforeEach(async ({ request }) => {
  await resetApi(request)
})

// Day of the month in India, matching the mock API's idea of today.
function istDay(offsetDays = 0): number {
  const ist = new Date(Date.now() + 5.5 * 3600_000 + offsetDays * 86_400_000)
  return ist.getUTCDate()
}

async function addRecurring(
  page: Page,
  options: { amount: string; category: string; type?: string; description: string; day: number },
) {
  const form = page.locator('form', { has: page.getByRole('button', { name: 'Save recurring expense' }) })
  await form.getByLabel('Usual amount').fill(options.amount)
  await form.getByRole('button', { name: options.category, exact: true }).click()
  if (options.type) await form.getByLabel(options.type).check()
  await form.getByLabel('Description').fill(options.description)
  await form.getByLabel('Due every month on the').selectOption({ label: ordinal(options.day) })
  await form.getByRole('button', { name: 'Save recurring expense' }).click()
}

test('recurring: due today shows on the dashboard and Confirm logs the expense once', async ({ page }) => {
  await page.goto('/more')
  await page.getByRole('link', { name: 'Recurring expenses' }).click()
  await expect(page.getByRole('heading', { name: 'Recurring expenses' })).toBeVisible()

  // The first visit opens the form straight away, with the explanation until something is saved.
  await expect(page.getByRole('heading', { name: 'How it works' })).toBeVisible()
  await addRecurring(page, { amount: '5000', category: 'Other', type: 'Investment', description: 'SIP', day: istDay() })
  await expect(page.getByRole('heading', { name: 'How it works' })).toBeHidden()
  await expect(page.getByRole('status')).toContainText('SIP added. It is due today')

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click()
  const upcoming = page.getByRole('article', { name: 'Upcoming recurring payments' })
  await expect(upcoming).toContainText('SIP')
  await expect(upcoming).toContainText('Due today')

  await upcoming.getByRole('button', { name: 'Confirm SIP' }).click()
  // Next month is not due yet, so it stays listed without the buttons.
  await expect(upcoming.getByRole('button', { name: 'Confirm SIP' })).toBeHidden()
  await expect(upcoming).toContainText('SIP')
  await expect(upcoming).not.toContainText('Due today')

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Expenses' }).click()
  await expect(page.locator('.tx-row', { hasText: 'SIP' })).toHaveCount(1)
  await expect(page.locator('.tx-row', { hasText: 'SIP' })).toContainText('₹5,000')
})

test('recurring: the amount actually paid can differ from the usual one', async ({ page }) => {
  await page.goto('/recurring')
  await addRecurring(page, { amount: '5000', category: 'Investments', description: 'SIP', day: istDay() })

  const due = page.getByRole('article', { name: 'Due recurring expenses' })
  await expect(due).toContainText('Due today')
  await due.getByLabel('Amount for SIP').fill('5100')
  await due.getByRole('button', { name: 'Add SIP' }).click()
  // Next month is not due yet, so the card goes away.
  await expect(due).toBeHidden()

  await page.goto('/expenses')
  await expect(page.locator('.tx-row', { hasText: 'SIP' })).toContainText('₹5,100')
})

test('recurring: skip moves on without logging anything', async ({ page }) => {
  await page.goto('/recurring')
  await addRecurring(page, { amount: '499', category: 'Dining', description: 'Streaming', day: istDay() })

  const due = page.getByRole('article', { name: 'Due recurring expenses' })
  await due.getByRole('button', { name: 'Skip Streaming this month' }).click()
  await expect(due).toBeHidden()
  await expect(page.locator('.category-row', { hasText: 'Streaming' })).toContainText('Next')

  await page.goto('/expenses')
  await expect(page.getByText(/across 24 expenses/)).toBeVisible()
  await expect(page.locator('.tx-row', { hasText: 'Streaming' })).toHaveCount(0)
})

test('recurring: edit, pause, resume and delete', async ({ page }) => {
  await page.goto('/recurring')
  // Tomorrow's day is never due today (at the end of a month it wraps to the 1st of next month).
  await addRecurring(page, { amount: '15000', category: 'Rent', description: 'House rent', day: istDay(1) })
  await expect(page.getByRole('status')).toContainText('House rent added. First due')
  await expect(page.getByRole('article', { name: 'Due recurring expenses' })).toBeHidden()

  const row = page.locator('.category-row', { hasText: 'House rent' })
  await expect(row).toContainText('₹15,000.00 · Rent')

  await row.getByRole('button', { name: 'Edit House rent' }).click()
  await row.getByLabel('Usual amount').fill('16000')
  await row.getByRole('button', { name: 'Save changes' }).click()
  await expect(row).toContainText('₹16,000.00 · Rent')

  await row.getByRole('button', { name: 'Edit House rent' }).click()
  await row.getByRole('button', { name: 'Pause' }).click()
  await expect(row.locator('.status')).toHaveText('Paused')
  await row.getByRole('button', { name: 'Resume' }).click()
  await expect(row.locator('.status')).toContainText('Next')

  await row.getByRole('button', { name: 'Delete' }).click()
  await row.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.locator('.category-row', { hasText: 'House rent' })).toHaveCount(0)
})

test('recurring: weekly and yearly ones start on today by default and come due on their day', async ({ page }) => {
  await page.goto('/recurring')
  const form = page.locator('form', { has: page.getByRole('button', { name: 'Save recurring expense' }) })
  const ist = new Date(Date.now() + 5.5 * 3600_000)
  const weekday = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][ist.getUTCDay()]
  const month = ist.toLocaleString('en-GB', { month: 'long', timeZone: 'UTC' })

  await form.getByLabel('Usual amount').fill('1500')
  await form.getByRole('button', { name: 'Groceries', exact: true }).click()
  await form.getByLabel('Description').fill('Maid')
  await form.getByLabel('Weekly').check()
  await expect(form.getByLabel('Due every week on')).toHaveValue(String(ist.getUTCDay() || 7))
  await form.getByRole('button', { name: 'Save recurring expense' }).click()
  await expect(page.getByRole('status')).toContainText('Maid added. It is due today')

  // On a phone the form closes after a save.
  const again = page.getByRole('button', { name: 'New recurring expense' })
  if (await again.isVisible()) await again.click()
  await form.getByLabel('Usual amount').fill('12000')
  await form.getByRole('button', { name: 'Other', exact: true }).click()
  await form.getByLabel('Need').check()
  await form.getByLabel('Description').fill('Health insurance')
  await form.getByLabel('Yearly').check()
  await expect(form.getByLabel('Day', { exact: true })).toHaveValue(String(ist.getUTCDate()))
  await expect(form.getByLabel('Month', { exact: true })).toHaveValue(String(ist.getUTCMonth() + 1))
  await form.getByRole('button', { name: 'Save recurring expense' }).click()
  await expect(page.getByRole('status')).toContainText('Health insurance added. It is due today')

  const due = page.getByRole('article', { name: 'Due recurring expenses' })
  await due.getByRole('button', { name: 'Skip Maid this week' }).click()
  await expect(due).not.toContainText('Maid')

  // Each row says how often it repeats, without opening it.
  const insurance = page.getByRole('listitem').filter({ hasText: 'Health insurance' }).last()
  await expect(insurance).toContainText(`Every year on ${ist.getUTCDate()} ${month}`)
  const maid = page.getByRole('listitem').filter({ hasText: 'Maid' }).last()
  await expect(maid).toContainText(`Every ${weekday}`)
  await expect(maid.getByRole('button', { name: 'Edit Maid' })).toHaveAttribute('aria-expanded', 'false')
})
