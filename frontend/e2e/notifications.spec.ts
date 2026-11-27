import { expect, test } from '@playwright/test'
import { resetApi } from './helpers'

test.beforeEach(async ({ request }) => {
  await resetApi(request)
})

test('notifications: the kinds save for the account; the device switch explains why it is off', async ({
  page,
  request,
}) => {
  await page.goto('/settings')
  const card = page.getByRole('article', { name: 'Notifications' })

  // The dev server has no service worker, so this device cannot subscribe here.
  const device = card.getByRole('switch', { name: /Notifications on this phone/ })
  await expect(device).toBeDisabled()
  await expect(card).toContainText('not available in this version of the app')

  const evening = card.getByRole('switch', { name: /Evening reminder/ })
  await expect(evening).toBeChecked()
  await evening.click()
  await expect(evening).not.toBeChecked()
  const saved = await (await request.get('http://localhost:8080/api/notifications/settings')).json()
  expect(saved).toEqual({ recurringDue: true, eveningReminder: false, budgetAlerts: true, cycleSummary: true })

  await page.reload()
  await expect(
    page.getByRole('article', { name: 'Notifications' }).getByRole('switch', { name: /Evening reminder/ }),
  ).not.toBeChecked()
})
