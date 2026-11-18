import { expect, test } from '@playwright/test'
import { resetApi } from './helpers'

test('a new cycle asks once; "same as before" keeps the salary', async ({ page, request }) => {
  await resetApi(request, { onboarded: true, salaryConfirmed: false })
  await page.goto('/')
  const check = page.getByRole('article', { name: 'New cycle: did your salary change?' })
  await expect(check).toContainText('₹50,000.00')
  await check.getByRole('button', { name: 'No, same as before' }).click()
  await expect(check).toBeHidden()

  await page.reload()
  await expect(page.getByRole('heading', { name: 'Left to spend' })).toBeVisible()
  await expect(page.getByRole('article', { name: 'New cycle: did your salary change?' })).toBeHidden()
})

test('"it changed" updates this cycle\'s salary and the dashboard', async ({ page, request }) => {
  await resetApi(request, { onboarded: true, salaryConfirmed: false })
  await page.goto('/')
  const check = page.getByRole('article', { name: 'New cycle: did your salary change?' })
  await check.getByRole('button', { name: 'Yes, it changed' }).click()
  await check.getByLabel('Salary for this cycle (₹)').fill('60000')
  // Live preview of the new split.
  await expect(check).toContainText('Needs ₹30,000.00')
  await check.getByRole('button', { name: 'Save salary' }).click()
  await expect(check).toBeHidden()
  await expect(page.getByRole('article', { name: 'Pay cycle budget' })).toContainText('₹60,000')
})

test('no question when the cycle is already answered', async ({ page, request }) => {
  await resetApi(request)
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Left to spend' })).toBeVisible()
  await expect(page.getByText('did your salary change?')).toBeHidden()
})
