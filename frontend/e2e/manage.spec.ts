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

  // Filters start folded away on a phone.
  await page.getByText('Filters').click()
  await page.getByLabel('Category').selectOption({ label: 'Other' })
  await expect(page.getByText('1 expense', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reset to this cycle' }).click()
  await expect(page.getByText('24 expenses')).toBeVisible()
})

test('expenses: edit keeps the chosen type for Other and saves the new amount', async ({ page }) => {
  await page.goto('/expenses')
  // Tapping a row opens it for editing.
  await page.getByRole('button', { name: /^Edit Gift for Asha/ }).click()

  const form = page.locator('.expense-list form')
  await expect(form.getByLabel('Amount')).toHaveValue('555')
  await expect(form.getByLabel('Want')).toBeChecked()
  await form.getByLabel('Amount').fill('600.25')
  await form.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.locator('.expense-row', { hasText: 'Gift for Asha' })).toContainText('₹600.25')
})

test('expenses: delete asks for confirmation first', async ({ page }) => {
  await page.goto('/expenses')
  // Delete lives inside the edit view and still asks first.
  await page.locator('.expense-row').first().click()
  await page.getByRole('button', { name: 'Delete expense' }).click()
  await page.getByRole('button', { name: 'Keep' }).click()
  await expect(page.getByText('24 expenses')).toBeVisible()

  await page.getByRole('button', { name: 'Delete expense' }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
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

  await page.getByRole('button', { name: 'Edit Pets' }).click()
  await page.getByLabel('Name', { exact: true }).fill('Pet care')
  await page.getByRole('button', { name: 'Rename' }).click()
  await expect(needs.getByText('Pet care')).toBeVisible()
  await page.getByLabel('Type', { exact: true }).selectOption('WANT')
  await expect(wants.getByText('Pet care')).toBeVisible()

  await expect(page.getByText('Built in', { exact: true })).toBeVisible()
})

test('categories: a category with expenses cannot be deleted, but can be archived and restored', async ({ page }) => {
  await page.goto('/categories')
  const dining = page.locator('.category-row', { hasText: 'Dining' })
  await page.getByRole('button', { name: 'Edit Dining' }).click()
  await dining.getByRole('button', { name: 'Delete' }).click()
  await dining.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(dining.getByRole('alert')).toContainText('Archive it instead')
  await dining.getByRole('button', { name: 'Keep' }).click()

  await dining.getByRole('button', { name: 'Archive' }).click()
  const archived = page.locator('.card', { has: page.getByRole('heading', { name: 'Archived' }) })
  await expect(archived.getByText('Dining')).toBeVisible()

  // Archived categories are not offered for new expenses.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Add' }).click()
  await expect(page.getByRole('button', { name: 'Rent', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Dining', exact: true })).toHaveCount(0)

  // On a phone, Categories is reached through More.
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' }).click()
  await page.getByRole('link', { name: 'Categories' }).click()
  await page.getByRole('button', { name: 'Edit Dining' }).click()
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
  for (const path of ['/', '/add', '/expenses', '/recurring', '/categories', '/settings']) {
    await page.goto(path)
    await expect(page.locator('main h1').first()).toBeVisible()
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width, `${path} is wider than the screen`).toBeLessThanOrEqual(360)
  }
})

test('phones get a bottom tab bar with More; wide screens get the top bar', async ({ page }) => {
  await page.goto('/')
  const tabs = page.getByRole('navigation', { name: 'Main' })
  await expect(tabs.getByRole('link')).toHaveText(['Dashboard', 'Add', 'Expenses', 'More'])
  await tabs.getByRole('link', { name: 'More' }).click()
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 800 })
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText([
    'Dashboard',
    'Add expense',
    'Expenses',
    'Recurring',
    'Categories',
    'Settings',
  ])

  // The narrowest desktop width must still fit every link and Log out without scrolling sideways.
  await page.setViewportSize({ width: 768, height: 800 })
  await expect(page.getByRole('banner').getByRole('button', { name: 'Log out' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768)
})

test('every control on a phone is at least 44px tall and fields are at least 16px', async ({ page }) => {
  for (const path of ['/', '/add', '/expenses', '/recurring', '/categories', '/settings', '/more']) {
    await page.goto(path)
    await expect(page.locator('main h1').first()).toBeVisible()
    const problems = await page.$$eval('button, a, select, input, summary', (elements) =>
      elements
        .filter((e) => {
          const box = e.getBoundingClientRect()
          return box.width > 0 && box.height > 0
        })
        .flatMap((e) => {
          const box = e.getBoundingClientRect()
          const name = (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 20)
          const issues = []
          if (box.height < 44) issues.push(`${name}: ${Math.round(box.height)}px tall`)
          if (['INPUT', 'SELECT'].includes(e.tagName) && parseFloat(getComputedStyle(e).fontSize) < 16) {
            issues.push(`${name}: font under 16px (iOS zooms in)`)
          }
          return issues
        }),
    )
    expect(problems, path).toEqual([])
  }
})

test('appearance: a Light or Dark choice overrides the device and survives a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.goto('/settings')
  const html = page.locator('html')
  await expect(page.getByLabel('System')).toBeChecked()
  await expect(html).not.toHaveAttribute('data-theme', /.*/)

  await page.getByLabel('Light').check()
  await expect(html).toHaveAttribute('data-theme', 'light')
  await page.reload()
  await expect(page.getByLabel('Light')).toBeChecked()
  await expect(html).toHaveAttribute('data-theme', 'light')
  // Light page background even though the device is dark.
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(246, 247, 245)')

  await page.getByLabel('Dark').check()
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(27, 32, 40)')

  await page.getByLabel('System').check()
  await expect(html).not.toHaveAttribute('data-theme', /.*/)
})

test('wide screens use columns instead of one narrow column', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/add')
  // The latest expenses sit beside the form.
  const form = page.locator('.split-main')
  const latest = page.getByRole('complementary', { name: 'Latest expenses' })
  await expect(latest).toBeVisible()
  const formBox = (await form.boundingBox())!
  const latestBox = (await latest.boundingBox())!
  expect(latestBox.x).toBeGreaterThan(formBox.x + formBox.width)

  await page.goto('/categories')
  const groups = page.locator('.category-grid > .card')
  const first = (await groups.nth(0).boundingBox())!
  const second = (await groups.nth(1).boundingBox())!
  expect(second.y).toBeCloseTo(first.y, 0)

  await page.goto('/recurring')
  // The form is open in its own column without tapping anything.
  await expect(page.getByRole('heading', { name: 'New recurring expense' })).toBeVisible()
})
