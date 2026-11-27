import { expect, test, type Page } from '@playwright/test'
import { resetApi } from './helpers'

test.beforeEach(async ({ request }) => {
  await resetApi(request)
})

// Counts the API GETs the page makes from now on.
function countGets(page: Page) {
  const seen: string[] = []
  page.on('request', (r) => {
    if (r.method() === 'GET' && new URL(r.url()).pathname.startsWith('/api/')) seen.push(new URL(r.url()).pathname)
  })
  return seen
}

async function pull(page: Page, fromY: number, toY: number) {
  await page.evaluate(
    ([from, to]) => {
      const touch = (y: number) => new Touch({ identifier: 1, target: document.body, clientX: 150, clientY: y })
      document.body.dispatchEvent(new TouchEvent('touchstart', { touches: [touch(from)], bubbles: true }))
      for (let y = from; y <= to; y += 20) {
        document.body.dispatchEvent(new TouchEvent('touchmove', { touches: [touch(y)], bubbles: true }))
      }
      document.body.dispatchEvent(new TouchEvent('touchend', { touches: [], bubbles: true }))
    },
    [fromY, toY],
  )
}

test('going back to a page just seen shows it without asking the server again', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Recent transactions' })).toBeVisible()
  await page.getByRole('link', { name: 'Expenses' }).click()
  await expect(page.getByText(/Showing 1–/)).toBeVisible()

  const gets = countGets(page)
  await page.getByRole('link', { name: 'Home' }).click()
  await expect(page.getByRole('heading', { name: 'Recent transactions' })).toBeVisible()
  await page.getByRole('link', { name: 'Expenses' }).click()
  await expect(page.getByText(/Showing 1–/)).toBeVisible()
  expect(gets).toEqual([])
})

test('a change clears the memory, so totals are never out of date', async ({ page }) => {
  await page.goto('/expenses')
  await expect(page.getByText(/Showing 1–/)).toBeVisible()
  await page.getByRole('link', { name: 'Add expense' }).click()
  await page.getByLabel('Amount').fill('777')
  await page.getByRole('button', { name: 'Groceries', exact: true }).click()
  await page.getByLabel('Description').fill('Fresh test')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByRole('status')).toContainText('Saved ₹777.00 in Groceries')

  await page.getByRole('link', { name: 'Expenses' }).click()
  await expect(page.getByText('Fresh test')).toBeVisible()
})

test('pulling down at the top reloads the page from the server', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Recent transactions' })).toBeVisible()
  const gets = countGets(page)

  // A short pull does nothing.
  await pull(page, 100, 160)
  await page.waitForTimeout(300)
  expect(gets).toEqual([])

  await pull(page, 100, 300)
  await expect.poll(() => gets.includes('/api/cycles/current/report')).toBe(true)
  await expect(page.getByRole('heading', { name: 'Recent transactions' })).toBeVisible()
})

test('log again: an expense logged twice becomes a one-tap chip, and Undo takes it back', async ({ page, request }) => {
  const categories = (await (await request.get('http://localhost:8080/api/categories')).json()) as {
    id: string
    name: string
  }[]
  const dining = categories.find((c) => c.name === 'Dining')!.id
  for (let i = 0; i < 2; i++) {
    const r = await request.post('http://localhost:8080/api/expenses', {
      data: { categoryId: dining, amountPaise: 2_000, description: 'Chai' },
    })
    expect(r.ok()).toBeTruthy()
  }
  const count = async () =>
    ((await (await request.get('http://localhost:8080/api/expenses?size=100')).json()) as { totalItems: number })
      .totalItems
  const before = await count()

  await page.goto('/add')
  const chip = page.getByRole('button', { name: 'Log Chai, ₹20.00 in Dining, for today' })
  await chip.click()
  const status = page.locator('.quick-status')
  await expect(status).toContainText('Saved ₹20.00 in Dining.')
  expect(await count()).toBe(before + 1)

  await status.getByRole('button', { name: 'Undo' }).click()
  await expect(status).toContainText('Removed.')
  expect(await count()).toBe(before)
})

test('phone dashboard: today first, the three buckets as rows, the charts behind More details', async ({ page }) => {
  await page.goto('/')
  const today = page.getByRole('article', { name: 'You can spend today' })
  await expect(today).toContainText(/₹[\d,]+/)
  await expect(today).toContainText('left for needs and wants')
  for (const name of ['Needs', 'Wants', 'Savings']) await expect(page.getByRole('listitem', { name })).toBeVisible()

  const trend = page.getByRole('heading', { name: 'Spending trend' })
  await expect(trend).toBeHidden()
  await page.locator('details.more-details > summary').click()
  await expect(trend).toBeVisible()
  await expect(page.getByRole('article', { name: 'Pay cycle budget' })).toBeVisible()
})

test('budget alerts: a note when an expense crosses 80%, then amber and red cards on the dashboard', async ({
  page,
  request,
}) => {
  type Line = { allocatedPaise: number; spentPaise: number }
  const wants = async () =>
    ((await (await request.get('http://localhost:8080/api/cycles/current/report')).json()) as { wants: Line }).wants
  const start = await wants()
  // Whole rupees that take wants from below 80% to about 85% of the plan.
  const rupees = Math.ceil((start.allocatedPaise * 0.85 - start.spentPaise) / 100)
  expect(start.spentPaise * 100).toBeLessThan(start.allocatedPaise * 80)

  await page.goto('/add')
  await page.getByLabel('Amount').fill(String(rupees))
  await page.getByRole('button', { name: 'Dining', exact: true }).click()
  await page.getByLabel('Description').fill('Team dinner')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.getByRole('status')).toContainText('Heads up: wants are at 85% of the plan')

  await page.goto('/')
  const alerts = page.getByRole('list', { name: 'Budget alerts' })
  await expect(alerts.getByRole('listitem')).toHaveCount(1)
  await expect(alerts).toContainText('Close to the limit. Wants: 85% of the plan used')

  // Past the plan: the card turns red and says by how much.
  const now = await wants()
  const dining = (
    (await (await request.get('http://localhost:8080/api/categories')).json()) as { id: string; name: string }[]
  ).find((c) => c.name === 'Dining')!.id
  const r = await request.post('http://localhost:8080/api/expenses', {
    data: { categoryId: dining, amountPaise: now.allocatedPaise - now.spentPaise + 10_000, description: 'Concert' },
  })
  expect(r.ok()).toBeTruthy()
  await page.reload()
  const item = alerts.getByRole('listitem')
  await expect(item).toContainText('Limit reached. Wants are ₹100.00 over plan.')
  await expect(item).toHaveClass(/reached/)

  const link = item.getByRole('link', { name: 'See wants' })
  expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44)
  await link.click()
  await expect(page).toHaveURL(/\/expenses\?.*type=WANT/)
})
