import { expect, test } from '@playwright/test'
import { resetApi } from './helpers'

test.beforeEach(async ({ request }) => {
  await resetApi(request)
})

test('an expense added offline waits on the phone and is sent once back online', async ({ page, context }) => {
  // Open Add once online, so the categories are on the phone.
  await page.goto('/add')
  await expect(page.getByRole('button', { name: 'Dining', exact: true })).toBeVisible()

  await context.setOffline(true)
  await expect(page.getByRole('status').filter({ hasText: "You're offline" })).toBeVisible()

  await page.getByLabel('Amount').fill('240')
  await page.getByRole('button', { name: 'Dining', exact: true }).click()
  await page.getByLabel('Description').fill('Chai offline')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.locator('.toast')).toContainText('Saved on this phone')
  const waiting = page.getByRole('article', { name: /Waiting to be sent/ })
  await expect(waiting).toContainText('Chai offline')
  await expect(waiting).toContainText('₹240.00')

  // Back online: it is sent by itself and the list empties.
  await context.setOffline(false)
  await expect(waiting).toBeHidden()

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Expenses' }).click()
  await expect(page.locator('.tx-row', { hasText: 'Chai offline' })).toHaveCount(1)
})

test('an expense the server refuses stays for the user to retry or discard', async ({ page, context, request }) => {
  await page.goto('/add')
  await expect(page.getByRole('button', { name: 'Dining', exact: true })).toBeVisible()
  await context.setOffline(true)

  await page.getByLabel('Amount').fill('99')
  await page.getByRole('button', { name: 'Dining', exact: true }).click()
  await page.getByLabel('Description').fill('Snack')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.locator('.toast')).toContainText('Saved on this phone')

  // Meanwhile, on another device, Dining is archived.
  const categories = (await (await request.get('http://localhost:8080/api/categories')).json()) as {
    id: string
    name: string
  }[]
  const dining = categories.find((c) => c.name === 'Dining')!
  await request.patch(`http://localhost:8080/api/categories/${dining.id}`, { data: { archived: true } })

  await context.setOffline(false)
  const waiting = page.getByRole('article', { name: /Waiting to be sent/ })
  await expect(waiting).toContainText('Not sent: This category is archived')
  await expect(page.getByRole('status').filter({ hasText: 'could not be sent' })).toBeVisible()

  await waiting.getByRole('button', { name: 'Discard' }).click()
  await expect(waiting).toBeHidden()
})

test('the app opens without a connection for the user who signed in on this phone', async ({ page }) => {
  // Signed in once online: the user and categories are remembered.
  await page.goto('/add')
  await expect(page.getByRole('button', { name: 'Dining', exact: true })).toBeVisible()

  // Reopen with no network: the browser says offline and every API call fails.
  await page.addInitScript(() => {
    let online = false
    Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => online })
    ;(window as unknown as { goOnline: () => void }).goOnline = () => {
      online = true
      window.dispatchEvent(new Event('online'))
    }
  })
  await page.route('**/api/**', (route) => route.abort('internetdisconnected'))
  await page.reload()

  // Not the "You're offline" dead end: the app itself, with a banner.
  await expect(page.getByRole('heading', { name: 'Add expense' })).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: "You're offline" })).toBeVisible()
  await page.getByLabel('Amount').fill('50')
  await page.getByRole('button', { name: 'Dining', exact: true }).click()
  await page.getByLabel('Description').fill('Bus snack')
  await page.getByRole('button', { name: 'Save expense' }).click()
  await expect(page.locator('.toast')).toContainText('Saved on this phone')

  // Connection back: the session is renewed from the cookie and the expense is sent.
  await page.unroute('**/api/**')
  await page.evaluate(() => (window as unknown as { goOnline: () => void }).goOnline())
  await expect(page.getByRole('article', { name: /Waiting to be sent/ })).toBeHidden()
  await expect(page.getByRole('status').filter({ hasText: "You're offline" })).toBeHidden()
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Expenses' }).click()
  await expect(page.locator('.tx-row', { hasText: 'Bus snack' })).toHaveCount(1)
})
