import { expect, test } from '@playwright/test'
import { resetApi } from './helpers'

test.beforeEach(async ({ request }) => {
  await resetApi(request)
})

test('the app manifest is valid enough to install, and its icons exist', async ({ page, request }) => {
  await page.goto('/')
  const href = await page.locator('link[rel="manifest"]').getAttribute('href')
  expect(href).toBe('/manifest.webmanifest')

  const manifest = await (await request.get('/manifest.webmanifest')).json()
  expect(manifest).toMatchObject({ name: 'Fifty30', start_url: '/', display: 'standalone', scope: '/' })
  const sizes = manifest.icons.map((icon: { sizes: string; purpose: string }) => `${icon.sizes} ${icon.purpose}`)
  expect(sizes).toEqual(expect.arrayContaining(['192x192 any', '512x512 any', '512x512 maskable']))

  for (const path of [...manifest.icons.map((icon: { src: string }) => icon.src), '/apple-touch-icon.png']) {
    const response = await request.get(path)
    expect(response.status(), path).toBe(200)
    expect(response.headers()['content-type'], path).toContain('image/png')
  }
})

test('with no network the app says it is offline, then continues by itself when back online', async ({ page }) => {
  // Every ping fails instantly, as it does with no connection at all.
  await page.route('**/api/ping', (route) => route.abort('internetdisconnected'))
  await page.goto('/expenses')
  await expect(page.getByText("You're offline.")).toBeVisible({ timeout: 10_000 })

  await page.unroute('**/api/ping')
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(page.getByRole('heading', { name: 'Expenses' })).toBeVisible()
})

test('More explains how to install the app', async ({ page }) => {
  await page.goto('/more')
  await expect(page.getByRole('heading', { name: 'Install the app' })).toBeVisible()
  // Desktop Chromium in tests has no install prompt, so it shows the browser-menu instructions.
  await expect(page.getByText('Install app')).toBeVisible()
})
