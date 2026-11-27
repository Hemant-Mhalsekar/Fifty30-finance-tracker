import { expect, test, type Page } from '@playwright/test'
import { resetApi } from './helpers'

test.beforeEach(async ({ request }) => {
  await resetApi(request)
})

// What Chrome on Android fires when the app can be installed; the test decides the answer.
async function offerInstall(page: Page, outcome: 'accepted' | 'dismissed') {
  await page.evaluate((answer) => {
    const event = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
      prompt: () => Promise<void>
      userChoice: Promise<{ outcome: string }>
    }
    event.prompt = async () => {
      ;(window as unknown as { promptShown: boolean }).promptShown = true
    }
    event.userChoice = Promise.resolve({ outcome: answer })
    window.dispatchEvent(event)
  }, outcome)
}

test('install: the dashboard offers it, "Not now" keeps it away, Install opens the browser dialog', async ({
  page,
}) => {
  await page.goto('/')
  await expect(page.getByText('You can spend today')).toBeVisible()
  const banner = page.getByRole('region', { name: 'Install the app' })
  // Only once the browser says the app can be installed.
  await expect(banner).toHaveCount(0)

  await offerInstall(page, 'dismissed')
  await expect(banner).toBeVisible()
  await banner.getByRole('button', { name: 'Not now' }).click()
  await expect(banner).toHaveCount(0)
  await page.reload()
  await expect(page.getByText('You can spend today')).toBeVisible()
  await offerInstall(page, 'dismissed')
  await expect(banner).toHaveCount(0)

  // A fresh device: Install shows the browser's own dialog and the banner goes once accepted.
  await page.evaluate(() => localStorage.removeItem('fifty30-install-dismissed'))
  await page.reload()
  await expect(page.getByText('You can spend today')).toBeVisible()
  await offerInstall(page, 'accepted')
  await banner.getByRole('button', { name: 'Install' }).click()
  await expect(banner).toHaveCount(0)
  expect(await page.evaluate(() => (window as unknown as { promptShown?: boolean }).promptShown)).toBe(true)
})

test('app icon badge shows the payments waiting for an answer', async ({ page, request }) => {
  await page.addInitScript(() => {
    const calls: (number | 'clear')[] = []
    ;(window as unknown as { badgeCalls: typeof calls }).badgeCalls = calls
    Object.assign(navigator, {
      setAppBadge: async (n?: number) => {
        calls.push(n ?? 0)
      },
      clearAppBadge: async () => {
        calls.push('clear')
      },
    })
  })
  const categories = (await (await request.get('http://localhost:8080/api/categories')).json()) as {
    id: string
    name: string
  }[]
  const day = new Date(Date.now() + 5.5 * 3600_000).getUTCDate()
  const created = await request.post('http://localhost:8080/api/recurring-expenses', {
    data: {
      categoryId: categories.find((c) => c.name === 'Rent')!.id,
      amountPaise: 1_500_000,
      description: 'Rent',
      dayOfMonth: day,
    },
  })
  expect(created.ok()).toBeTruthy()

  await page.goto('/')
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { badgeCalls: unknown[] }).badgeCalls.at(-1)))
    .toBe(1)
})

test('a new page opens at the top, with its entry animation', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText('You can spend today')).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 600))
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0)

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Expenses' }).click()
  await expect(page.getByRole('heading', { name: 'Your Expenses' })).toBeVisible()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await expect(page.locator('.page-enter')).toHaveCount(1)
})
