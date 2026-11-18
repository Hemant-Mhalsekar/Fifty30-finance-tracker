import { expect, test } from '@playwright/test'
import { resetApi } from './helpers'

test.beforeEach(async ({ request }) => {
  await resetApi(request)
})

test('expenses: newest first, paging, day totals and category filter', async ({ page }) => {
  await page.goto('/expenses')
  await expect(page.getByText(/across 24 expenses/)).toBeVisible()
  await expect(page.locator('.tx-title').first()).toHaveText('Gift for Asha')
  // Today's total counts every expense of the day: Gift (₹555) + Expense 10 (₹109) + Expense 20 (₹119).
  await expect(page.locator('.day-card').first().locator('.total')).toContainText('₹783')

  await expect(page.getByText('Showing 1–20 of 24')).toBeVisible()
  await page.getByRole('button', { name: 'Next' }).click()
  await expect(page.getByText('Showing 21–24 of 24')).toBeVisible()
  await expect(page.locator('.tx-row')).toHaveCount(4)

  // Dates and category sit behind the date button.
  await page.locator('.range-picker summary').click()
  await page.getByLabel('Category').selectOption({ label: 'Other' })
  await expect(page.getByText(/across 1 expense$/)).toBeVisible()
  await page.getByRole('button', { name: 'Reset to this cycle' }).click()
  await expect(page.getByText(/across 24 expenses/)).toBeVisible()
})

test('expenses: search and type filters narrow the list and its total', async ({ page }) => {
  await page.goto('/expenses')
  await page.getByLabel('Search expenses').fill('gift')
  await expect(page.getByText(/₹555 spent across 1 expense$/)).toBeVisible()
  await page.getByLabel('Search expenses').fill('')
  await expect(page.getByText(/across 24 expenses/)).toBeVisible()

  await page.getByRole('button', { name: 'Needs', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Needs', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByText(/across 12 expenses/)).toBeVisible()
  await expect(page.locator('.tx-row', { hasText: 'Gift for Asha' })).toHaveCount(0)
  await page.getByRole('button', { name: 'All', exact: true }).click()
  await expect(page.getByText(/across 24 expenses/)).toBeVisible()
})

test('expenses: edit keeps the chosen type for Other and saves the new amount', async ({ page }) => {
  await page.goto('/expenses')
  // Tapping a row opens it for editing.
  await page.getByRole('button', { name: /^Edit Gift for Asha,/ }).click()

  const form = page.locator('.tx-list form')
  await expect(form.getByLabel('Amount')).toHaveValue('555')
  await expect(form.getByLabel('Want')).toBeChecked()
  await form.getByLabel('Amount').fill('600.25')
  await form.getByRole('button', { name: 'Save changes' }).click()

  await expect(page.locator('.tx-row', { hasText: 'Gift for Asha' })).toContainText('₹600.25')
})

test('expenses: delete asks for confirmation first', async ({ page }) => {
  await page.goto('/expenses')
  await page.getByRole('button', { name: 'Delete Gift for Asha' }).click()
  await page.getByRole('button', { name: 'Keep' }).click()
  await expect(page.getByText(/across 24 expenses/)).toBeVisible()

  await page.getByRole('button', { name: 'Delete Gift for Asha' }).click()
  await page.getByRole('button', { name: 'Confirm delete' }).click()
  await expect(page.getByText(/across 23 expenses/)).toBeVisible()
  await expect(page.locator('.tx-row', { hasText: 'Gift for Asha' })).toHaveCount(0)
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
  // Preview of the new split: needs are 50% of ₹60,000.
  await expect(page.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Salary' }) })).toContainText(
    'Needs 50%₹30,000',
  )
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
  for (const path of [
    '/',
    '/add',
    '/expenses',
    '/budgets',
    '/reports',
    '/recurring',
    '/categories',
    '/settings',
    '/more',
  ]) {
    await page.goto(path)
    await expect(page.locator('main h1').first()).toBeVisible()
    const width = await page.evaluate(() => document.documentElement.scrollWidth)
    expect(width, `${path} is wider than the screen`).toBeLessThanOrEqual(360)
  }
})

test('phones and tablets get the floating tab bar with More; wide screens get the sidebar', async ({ page }) => {
  await page.goto('/')
  const tabs = page.getByRole('navigation', { name: 'Main' })
  await expect(tabs.getByRole('link')).toHaveText(['Home', 'Expenses', '', 'Reports', 'More'])
  await expect(tabs.getByRole('link', { name: 'Add expense' })).toBeVisible()
  await tabs.getByRole('link', { name: 'More' }).click()
  await expect(page.getByRole('link', { name: 'Budgets' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Settings' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Log out' })).toBeVisible()

  await page.setViewportSize({ width: 1280, height: 800 })
  const sidebar = page.getByRole('complementary')
  await expect(sidebar.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText([
    'Overview',
    'Expenses',
    'Budgets',
    'Recurring',
    'Reports',
    'Categories',
    'Settings',
  ])
  await expect(sidebar.getByText('Current pay cycle')).toBeVisible()
  await expect(sidebar.getByRole('link', { name: 'Add Expense' })).toBeVisible()
  await expect(sidebar.getByRole('button', { name: 'Log out' })).toBeVisible()

  // The narrowest sidebar width must not scroll sideways.
  await page.setViewportSize({ width: 1024, height: 800 })
  await expect(sidebar.getByRole('link', { name: 'Overview' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(1024)

  // A 768px tablet keeps the tab bar instead.
  await page.setViewportSize({ width: 768, height: 800 })
  await expect(sidebar).toBeHidden()
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'More' })).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(768)
})

test('every control on a phone is at least 44px tall and fields are at least 16px', async ({ page }) => {
  for (const path of [
    '/',
    '/add',
    '/expenses',
    '/budgets',
    '/reports',
    '/recurring',
    '/categories',
    '/settings',
    '/more',
  ]) {
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
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(246, 246, 248)')

  await page.getByLabel('Dark').check()
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(18, 19, 22)')

  await page.getByLabel('System').check()
  await expect(html).not.toHaveAttribute('data-theme', /.*/)
})

test('wide screens use columns instead of one narrow column', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  // Needs, wants and savings side by side.
  const needs = (await page.getByRole('article', { name: 'Needs' }).boundingBox())!
  const savings = (await page.getByRole('article', { name: 'Savings' }).boundingBox())!
  expect(savings.y).toBeCloseTo(needs.y, 0)
  expect(savings.x).toBeGreaterThan(needs.x + needs.width)

  await page.goto('/categories')
  const groups = page.locator('.category-grid > .card')
  const first = (await groups.nth(0).boundingBox())!
  const second = (await groups.nth(1).boundingBox())!
  expect(second.y).toBeCloseTo(first.y, 0)

  await page.goto('/recurring')
  // The form is open in its own column without tapping anything.
  await expect(page.getByRole('heading', { name: 'New recurring expense' })).toBeVisible()

  // A 1024px laptop window already gets two columns: form left, "How it works" beside it, top-aligned.
  await page.setViewportSize({ width: 1024, height: 800 })
  const formCard = (await page.locator('.area-form').boundingBox())!
  const help = (await page.getByRole('heading', { name: 'How it works' }).locator('..').boundingBox())!
  expect(help.x).toBeGreaterThan(formCard.x + formCard.width)
  expect(help.y).toBeCloseTo(formCard.y, 0)
})

test('expenses: download the filtered list as CSV', async ({ page }) => {
  await page.goto('/expenses')
  await page.locator('.range-picker summary').click()
  await page.getByLabel('Category').selectOption({ label: 'Other' })
  await expect(page.getByText(/across 1 expense$/)).toBeVisible()

  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  const download = await downloadPromise

  const from = await page.getByLabel('From', { exact: true }).inputValue()
  const to = await page.getByLabel('To', { exact: true }).inputValue()
  expect(download.suggestedFilename()).toBe(`fifty30-expenses-${from}-to-${to}.csv`)
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  const lines = Buffer.concat(chunks).toString('utf8').replace(/^﻿/, '').trimEnd().split('\r\n')
  expect(lines[0]).toBe('Date,Description,Category,Type,Amount (INR)')
  expect(lines).toHaveLength(2)
  expect(lines[1]).toMatch(/^\d{4}-\d{2}-\d{2},Gift for Asha,Other,Want,555\.00$/)
})

test('budgets: each bucket with its categories, and the cycle can be changed', async ({ page }) => {
  await page.goto('/more')
  await page.getByRole('link', { name: 'Budgets' }).click()
  await expect(page.getByRole('heading', { name: 'Budget Details' })).toBeVisible()

  const needs = page.getByRole('article', { name: 'Needs • 50%' })
  await expect(needs).toContainText('₹25,000')
  await expect(needs).toContainText('₹1,332')
  const needsBreakdown = page.getByRole('article', { name: 'Needs breakdown' })
  await expect(needsBreakdown).toContainText('Groceries')
  await expect(needsBreakdown).toContainText('12 expenses')
  const wantsBreakdown = page.getByRole('article', { name: 'Wants breakdown' })
  await expect(wantsBreakdown).toContainText('Dining')
  await expect(wantsBreakdown).toContainText('Other')

  await page.getByRole('button', { name: 'Previous cycle' }).click()
  await expect(page.locator('.cycle-switch')).toContainText('Past cycle')
  await expect(needsBreakdown).toContainText('Nothing spent here in this cycle.')
})

test('settings: the name can be changed, and hidden from the greeting without losing it', async ({ page }) => {
  await page.goto('/settings')
  await page.getByLabel('Your name', { exact: true }).fill('Arjun Mehta')
  await page.getByRole('article', { name: 'Profile' }).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()

  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Home' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/, Arjun$/)

  await page.goto('/settings')
  const show = page.getByRole('switch', { name: /Show my name in the greeting/ })
  await expect(show).toBeChecked()
  await show.uncheck()
  await page.getByRole('article', { name: 'Profile' }).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
  await expect(page.getByLabel('Your name', { exact: true })).toHaveValue('Arjun Mehta')
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/^Good (morning|afternoon|evening)$/)

  await page.goto('/settings')
  await page.getByRole('switch', { name: /Show my name in the greeting/ }).check()
  await page.getByRole('article', { name: 'Profile' }).getByRole('button', { name: 'Save', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible()
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(/, Arjun$/)
})

test('split: choosing another split redoes this cycle and the dashboard follows', async ({ page }) => {
  await page.goto('/settings')
  const card = page.getByRole('article', { name: 'Budget split' })
  await expect(card.getByLabel(/Balanced/)).toBeChecked()
  await card.getByLabel(/High rent/).check()
  // Preview of ₹50,000 at 60/20/20.
  await expect(card).toContainText('Needs 60%₹30,000')
  await card.getByRole('button', { name: 'Use this split' }).click()
  await expect(card.getByRole('status')).toContainText('High rent (60/20/20) now applies')

  await page.goto('/')
  const needs = page.getByRole('article', { name: 'Needs' })
  await expect(needs).toContainText('60% • Essentials')
  await expect(needs).toContainText('of ₹30,000')
  await page.goto('/budgets')
  await expect(page.getByRole('article', { name: 'Wants • 20%' })).toContainText('₹10,000')
})

test('bonus: added to this cycle, split like salary, and removable', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: '+ Add a bonus' }).click()
  const card = page.getByRole('article', { name: 'Bonus this cycle' })
  await card.getByLabel('Bonus amount (₹)').fill('10000')
  await card.getByRole('button', { name: 'Add bonus' }).click()
  await expect(card.getByRole('status')).toContainText('Bonus of ₹10,000.00 added')

  await page.goto('/')
  const hero = page.getByRole('article', { name: 'Pay cycle budget' })
  await expect(hero).toContainText('₹60,000')
  await expect(hero).toContainText('Salary ₹50,000 + bonus ₹10,000')
  await expect(page.getByRole('article', { name: 'Needs' })).toContainText('of ₹30,000')

  await page.goto('/settings')
  await card.getByRole('button', { name: 'Remove bonus' }).click()
  await expect(card.getByRole('status')).toContainText('Bonus removed')
  await page.goto('/')
  await expect(hero).toContainText('₹50,000')
  await expect(page.getByRole('link', { name: '+ Add a bonus' })).toBeVisible()
})

test('opening balance: total savings in Reports starts from it', async ({ page }) => {
  await page.goto('/settings')
  const card = page.getByRole('article', { name: 'Opening balance' })
  await card.getByLabel('Savings you started with (₹)').fill('1,00,000')
  await card.getByRole('button', { name: 'Save', exact: true }).click()
  await expect(card.getByRole('status')).toContainText('Opening balance saved')

  await page.goto('/reports?view=savings')
  const total = page.locator('.stat-tile', { hasText: 'Total savings' })
  await expect(total).toContainText('Your opening balance of ₹1,00,000')

  await page.goto('/settings')
  await card.getByRole('button', { name: 'Remove' }).click()
  await expect(card.getByRole('status')).toContainText('Opening balance removed')
  await page.goto('/reports?view=savings')
  await expect(page.locator('.stat-tile', { hasText: 'Total savings' })).toHaveCount(0)
})
