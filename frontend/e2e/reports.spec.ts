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
  await expect(page.getByLabel('This cycle')).toBeChecked()

  await page.getByLabel('Trends').check()
  await page.getByLabel('Years').check()
  await expect(page).toHaveURL(/view=trends&by=years/)
  await page.reload()
  await expect(page.getByLabel('Years')).toBeChecked()

  // Links from before the three tabs still open the same report.
  await page.goto('/reports?view=weekly')
  await expect(page.getByLabel('Trends')).toBeChecked()
  await expect(page.getByLabel('Weeks')).toBeChecked()
})

test('this cycle: one statement against the same day last cycle, and categories that open their expenses', async ({
  page,
  request,
}) => {
  // ₹1,500 of groceries today, on top of what the mock already holds for this cycle. The mock's
  // cycle started 10 days ago (day 11 today); ₹1,000 of dining on day 2 of the previous cycle.
  await logExpense(request, 'Groceries', 150_000, daysAgo(0))
  await logExpense(request, 'Dining', 100_000, daysAgo(40))
  await page.goto('/reports')
  const statement = page.getByRole('article', { name: /so far/ })
  await expect(statement.getByText('Income', { exact: true })).toBeVisible()
  await expect(statement.getByText('Daily limit')).toBeVisible()
  await expect(statement).toContainText(/of ₹25,000 planned/)
  await expect(statement).toContainText(/than by day 11 last cycle \(₹1,000\)/)

  const where = page.getByRole('list', { name: /Spending by category/ })
  const groceries = where.getByRole('link', { name: /Groceries/ })
  await expect(groceries).toContainText('% of the total')
  await groceries.click()
  await expect(page).toHaveURL(/\/expenses\?categoryId=/)
  // The list opens filtered to groceries over this cycle.
  await expect(page.locator('.range-picker-button')).toContainText('Groceries')
  await expect(page.getByText('₹1,500').first()).toBeVisible()
})

test('weekly: eight Monday-to-Sunday weeks with this week marked', async ({ page }) => {
  await page.goto('/reports?view=trends&by=weeks')
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
  await expect(page.getByLabel('Cycles')).toBeChecked()

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

test('categories: spending per category per cycle, with highlights', async ({ page, request }) => {
  // Previous cycle: ₹12,000 rent and ₹2,000 dining out of a ₹50,000 salary.
  await logExpense(request, 'Rent', 1_200_000, daysAgo(20))
  await logExpense(request, 'Dining', 200_000, daysAgo(25))

  await page.goto('/reports?view=categories')
  await expect(page.getByLabel('Categories')).toBeChecked()
  const highlights = page.getByRole('region', { name: 'Highlights' })
  await expect(highlights).toContainText(/Rent was your biggest spend in .*: ₹12,000, 86% of needs and wants\./)

  // A phone gets the finished cycle as bars, biggest first, each opening its expenses.
  const bars = page.getByRole('list', { name: /Spending by category/ })
  await expect(bars.getByRole('link').first()).toContainText('Rent')
  await expect(bars.getByRole('link').first()).toContainText('₹12,000')
  await expect(bars.getByRole('link').first()).toContainText('86% of the total')
  const card = page.getByRole('article').filter({ has: bars })
  await card.getByText('Show as table').click()
  await expect(card.locator('tbody tr').first()).toContainText('Rent')

  // The cycles report states the savings rate of that cycle: ₹36,000 of ₹50,000.
  await page.getByLabel('Cycles').check()
  await expect(page.getByRole('region', { name: 'Highlights' })).toContainText(/You saved 72% of your income in/)
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
