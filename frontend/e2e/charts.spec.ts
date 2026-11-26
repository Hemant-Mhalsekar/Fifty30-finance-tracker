import { expect, test } from '@playwright/test'
import { openMoreDetails, resetApi } from './helpers'

test.beforeEach(async ({ request }) => {
  await resetApi(request)
})

test('spending over the cycle: pace status, keyboard reading and table', async ({ page }) => {
  await page.goto('/')
  await openMoreDetails(page)
  const chart = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Spending trend' }) })
  await expect(chart).toBeVisible()
  // The seeded data spends far less than an even pace.
  await expect(chart.locator('.pace-status')).toContainText('under pace')

  // Focusing the chart reads today; arrow keys step back through the days.
  const svg = chart.getByRole('img')
  await svg.focus()
  const tooltip = chart.locator('.chart-tooltip')
  await expect(tooltip).toContainText('So far ₹3,108')
  await page.keyboard.press('ArrowLeft')
  await expect(tooltip).not.toContainText('So far ₹3,108')
  await page.keyboard.press('End')
  await expect(tooltip).toContainText('So far ₹3,108')

  await chart.getByText('Show as table').click()
  // The last row is today, with the running total.
  await expect(chart.locator('tbody tr').last()).toContainText('₹3,108')
})

test('past cycles: one column per cycle with totals, newest marked', async ({ page }) => {
  // The past cycles chart lives on the Budgets page.
  await page.goto('/budgets')
  const chart = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Past cycles' }) })
  await expect(chart).toContainText('Last 2 cycles')

  const columns = chart.getByRole('button')
  await expect(columns).toHaveCount(2)
  // The cycle on screen has the bold date label.
  await expect(chart.locator('text.strong')).toHaveCount(1)
  // The previous cycle has nothing logged, so it saved its whole salary.
  await expect(columns.first()).toHaveAccessibleName(/saved ₹50,000 of income ₹50,000/)
  await columns.last().focus()
  await expect(chart.locator('.chart-tooltip')).toContainText('Needs ₹1,332')

  await chart.getByText('Show as table').click()
  await expect(chart.locator('tbody tr')).toHaveCount(2)
})

test('going back a cycle redraws the charts for that cycle', async ({ page }) => {
  await page.goto('/budgets')
  await page.getByRole('button', { name: 'Previous cycle' }).click()
  const history = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Past cycles' }) })
  await expect(history).toContainText('This cycle')
  await expect(history.getByRole('button')).toHaveCount(1)

  await page.goto('/')
  await page.getByRole('button', { name: 'Previous cycle' }).click()
  await openMoreDetails(page)
  const spending = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Spending trend' }) })
  // A finished cycle shows spent of budget instead of a pace status.
  await expect(spending.locator('.chart-head')).toContainText('₹0 of ₹40,000')
})
