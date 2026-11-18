import { expect, test, type APIRequestContext } from '@playwright/test'
import { resetApi } from './helpers'

const API = 'http://localhost:8080'

test.beforeEach(async ({ request }) => {
  await resetApi(request)
})

// IST date `days` before today, matching the mock API's clock.
function daysAgo(days: number): string {
  const ist = new Date(Date.now() + 5.5 * 3600_000 - days * 86_400_000)
  return ist.toISOString().slice(0, 10)
}

async function logExpense(request: APIRequestContext, category: string, amountPaise: number, date: string) {
  const categories = (await (await request.get(`${API}/api/categories`)).json()) as { id: string; name: string }[]
  const categoryId = categories.find((c) => c.name === category)!.id
  const response = await request.post(`${API}/api/expenses`, {
    data: { categoryId, amountPaise, description: category, expenseDate: date },
  })
  expect(response.ok()).toBeTruthy()
}

test('reports are reached from More and remember the chosen view in the address', async ({ page }) => {
  await page.goto('/more')
  await page.getByRole('link', { name: 'Reports' }).click()
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible()
  await expect(page.getByLabel('Weekly')).toBeChecked()

  await page.getByLabel('Yearly').check()
  await expect(page).toHaveURL(/view=yearly/)
  await page.reload()
  await expect(page.getByLabel('Yearly')).toBeChecked()
})

test('weekly: eight Monday-to-Sunday weeks with this week marked', async ({ page }) => {
  await page.goto('/reports')
  const chart = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Spending by week' }) })
  await expect(chart.getByRole('button')).toHaveCount(8)
  await expect(chart.locator('text.strong')).toHaveCount(1)
  await expect(chart.getByRole('button').last()).toHaveAccessibleName(/this week so far/)
  await expect(page.getByText('This week so far')).toBeVisible()

  await chart.getByText('Show as table').click()
  await expect(chart.locator('tbody tr')).toHaveCount(8)
})

test('monthly: one column per pay cycle; saved shows once a cycle with expenses has ended', async ({
  page,
  request,
}) => {
  // ₹12,000 of needs in the previous cycle (salary ₹50,000) leaves ₹38,000 saved.
  await logExpense(request, 'Rent', 1_200_000, daysAgo(20))
  await page.goto('/reports?view=monthly')
  await expect(page.getByLabel('Monthly')).toBeChecked()

  const chart = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'By pay cycle' }) })
  await expect(chart.getByRole('button')).toHaveCount(2)
  await expect(chart.locator('text.strong')).toHaveCount(1)
  await expect(chart.getByRole('button').last()).toHaveAccessibleName(/\(current cycle\): needs ₹[\d,]+, wants/)
  await expect(chart.getByRole('button').first()).toHaveAccessibleName(/saved ₹38,000/)

  await expect(page.locator('.stat-tile', { hasText: 'so far' })).toContainText('planned for needs and wants')
  await expect(page.locator('.stat-tile', { hasText: 'Saved in' })).toContainText('₹38,000')

  await chart.getByText('Show as table').click()
  const rows = chart.locator('tbody tr')
  await expect(rows).toHaveCount(2)
  await expect(rows.first()).toContainText('₹38,000')
  // The current cycle has no "saved" yet.
  await expect(rows.last().locator('td').nth(4)).toHaveText('–')
})

test('yearly: one column per year with this year in bold', async ({ page }) => {
  await page.goto('/reports?view=yearly')
  const chart = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'By year' }) })
  await expect(chart.getByRole('button')).toHaveCount(new Set([daysAgo(41).slice(0, 4), daysAgo(10).slice(0, 4)]).size)
  await expect(chart.locator('text.strong')).toHaveCount(1)
  await expect(page.getByText(`${daysAgo(0).slice(0, 4)} so far`)).toBeVisible()
})

test('savings: only finished cycles with expenses count; the current one stays apart', async ({ page, request }) => {
  await page.goto('/reports?view=savings')
  // The previous cycle has nothing logged yet, so there is nothing to add up.
  await expect(page.getByText('No finished cycles with expenses yet.')).toBeVisible()
  await expect(page.getByText('This cycle so far')).toBeVisible()

  // ₹12,000 of needs in the previous cycle (salary ₹50,000) leaves ₹38,000 saved.
  await logExpense(request, 'Rent', 1_200_000, daysAgo(20))
  await page.reload()
  const chart = page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Saved per cycle' }) })
  await expect(chart.getByRole('button')).toHaveCount(1)
  await expect(chart.getByRole('button')).toHaveAccessibleName(/saved ₹38,000, running total ₹38,000/)
  await expect(page.locator('.stat-tile', { hasText: 'Saved in finished cycles' })).toContainText('₹38,000')
})
