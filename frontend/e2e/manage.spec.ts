import { expect, test } from '@playwright/test'
import { resetApi } from './helpers'

test.beforeEach(async ({ request }) => {
  await resetApi(request)
})

test('expenses: newest first, paging and category filter', async ({ page }) => {
  await page.goto('/expenses')
  await expect(page.getByText('24 expenses')).toBeVisible()
  await expect(page.locator('.expense-description').first()).toHaveText('Gift for Asha')

  await expect(page.getByText('Page 1 of 2')).toBeVisible()
  await page.getByRole('button', { name: 'Older →' }).click()
  await expect(page.getByText('Page 2 of 2')).toBeVisible()
  await expect(page.locator('.expense-row')).toHaveCount(4)

  await page.getByLabel('Category').selectOption({ label: 'Other' })
  await expect(page.getByText('1 expense', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'This cycle' }).click()
  await expect(page.getByText('24 expenses')).toBeVisible()
})

test('expenses: edit keeps the chosen type for Other and saves the new amount', async ({ page }) => {
  await page.goto('/expenses')
  const row = page.locator('.expense-row', { hasText: 'Gift for Asha' })
  await row.getByRole('button', { name: 'Edit' }).click()

  const form = page.locator('.expense-list form')
  await expect(form.getByLabel('Amount (₹)')).toHaveValue('555')
  await expect(form.getByLabel('Want')).toBeChecked()
  await form.getByLabel('Amount (₹)').fill('600.25')
  await form.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.locator('.expense-row', { hasText: 'Gift for Asha' })).toContainText('₹600.25')
})

test('expenses: delete asks for confirmation first', async ({ page }) => {
  await page.goto('/expenses')
  const first = page.locator('.expense-row').first()
  await first.getByRole('button', { name: 'Delete' }).click()
  await first.getByRole('button', { name: 'Keep' }).click()
  await expect(page.getByText('24 expenses')).toBeVisible()

  await first.getByRole('button', { name: 'Delete' }).click()
  await first.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.getByText('23 expenses')).toBeVisible()
})

test('categories: add, reject duplicates, rename and retype', async ({ page }) => {
  await page.goto('/categories')
  const wants = page.locator('.card', { has: page.getByRole('heading', { name: 'Wants' }) })
  const needs = page.locator('.card', { has: page.getByRole('heading', { name: 'Needs' }) })

  await page.getByLabel('Category name').fill('Pets')
  await page.getByLabel('Category type').selectOption('NEED')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(needs.getByText('Pets')).toBeVisible()

  await page.getByLabel('Category name').fill('pets')
  await page.getByRole('button', { name: 'Add' }).click()
  await expect(page.getByRole('alert')).toContainText('already exists')

  const pets = page.locator('.category-row', { hasText: 'Pets' })
  await pets.getByRole('button', { name: 'Rename' }).click()
  await page.getByLabel('New name for Pets').fill('Pet care')
  await page.getByRole('button', { name: 'Save' }).click()
  await page.getByLabel('Type of Pet care').selectOption('WANT')
  await expect(wants.getByText('Pet care')).toBeVisible()

  await expect(page.getByText('Built in.')).toBeVisible()
})

test('categories: a category with expenses cannot be deleted, but can be archived and restored', async ({ page }) => {
  await page.goto('/categories')
  const dining = page.locator('.category-row', { hasText: 'Dining' })
  await dining.getByRole('button', { name: 'Delete' }).click()
  await dining.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(dining.getByRole('alert')).toContainText('Archive it instead')
  await dining.getByRole('button', { name: 'Keep' }).click()

  await dining.getByRole('button', { name: 'Archive' }).click()
  const archived = page.locator('.card', { has: page.getByRole('heading', { name: 'Archived' }) })
  await expect(archived.getByText('Dining')).toBeVisible()

  // Archived categories are not offered for new expenses.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Add expense' }).click()
  await expect(page.getByLabel('Category').locator('option', { hasText: 'Dining' })).toHaveCount(0)

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Categories' }).click()
  await archived.locator('.category-row', { hasText: 'Dining' }).getByRole('button', { name: 'Restore' }).click()
  await expect(archived).toHaveCount(0)
})

test('settings: salary change with preview, pay-day change scheduled and cancelled', async ({ page }) => {
  await page.goto('/settings')
  const salary = page.getByLabel('Monthly take-home salary (₹)')
  await expect(salary).toHaveValue('50000')
  await expect(page.getByRole('button', { name: 'Update salary' })).toBeDisabled()

  await salary.fill('60,000')
  await expect(page.getByText('Needs ₹30,000.00')).toBeVisible()
  await page.getByRole('button', { name: 'Update salary' }).click()
  await expect(page.getByRole('status')).toContainText('Salary is now ₹60,000.00')

  await page.getByLabel('New pay day').selectOption('1')
  await page.getByRole('button', { name: 'Schedule change' }).click()
  await expect(page.getByText('The first cycle on the new pay day starts on')).toBeVisible()
  await page.getByRole('button', { name: 'Cancel this change' }).click()
  await expect(page.getByText('The first cycle on the new pay day starts on')).toHaveCount(0)
})

test('no page scrolls sideways on a small phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 })
  for (const path of ['/', '/add', '/expenses', '/categories', '/settings']) {
    await page.goto(path)
    await expect(page.locator('main h1').first()).toBeVisible()
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width, `${path} is wider than the screen`).toBeLessThanOrEqual(360)
  }
})
