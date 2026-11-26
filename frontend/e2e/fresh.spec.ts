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
