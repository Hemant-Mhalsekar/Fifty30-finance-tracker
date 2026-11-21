// A small in-memory stand-in for the Spring Boot API, used only by the Playwright tests.
// It follows the real API's shapes and the rules the UI depends on (protected Other,
// no delete with expenses, pagination, pending pay day), not every backend rule.
// Dates are relative to today in India so the tests keep working as time passes.
//
// POST /__reset with {"onboarded": true|false} restores a known state before each test.

import http from 'node:http'

const PORT = Number(process.env.MOCK_API_PORT ?? 8080)

const IST = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const today = () => IST.format(new Date())
function addDays(iso, days) {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

// Monthly due dates, as in MonthlySchedule.java: days past the end of a month fall on its last day.
function occurrenceIn(year, month, day) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return `${year}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`
}
function firstOnOrAfter(iso, day) {
  const [y, m] = iso.split('-').map(Number)
  const here = occurrenceIn(y, m, day)
  return here >= iso ? here : m === 12 ? occurrenceIn(y + 1, 1, day) : occurrenceIn(y, m + 1, day)
}
function following(iso, day) {
  const [y, m] = iso.split('-').map(Number)
  return m === 12 ? occurrenceIn(y + 1, 1, day) : occurrenceIn(y, m + 1, day)
}

const PRESETS = {
  BALANCED: [50, 30, 20],
  HIGH_RENT: [60, 20, 20],
  SAVER: [50, 20, 30],
  LOW_COST: [40, 30, 30],
}

// Like the server: the allocations are split from salary + bonus; 50/30/20 by default.
function split(salaryPaise, bonusPaise = 0, [needsPct, wantsPct, savingsPct] = PRESETS.BALANCED) {
  const income = salaryPaise + bonusPaise
  const needsPaise = Math.floor((income * needsPct) / 100)
  const wantsPaise = Math.floor((income * wantsPct) / 100)
  return {
    bonusPaise,
    needsPct,
    wantsPct,
    savingsPct,
    needsPaise,
    wantsPaise,
    savingsPaise: income - needsPaise - wantsPaise,
  }
}

const pctOf = (cycle) => [cycle.needsPct, cycle.wantsPct, cycle.savingsPct]

let state

function reset({ onboarded = true, salaryConfirmed = true } = {}) {
  let next = 0
  const id = (prefix) => `${prefix}${++next}`
  const start = addDays(today(), -10)
  const categories = [
    ['Rent', 'NEED'],
    ['Groceries', 'NEED'],
    ['Dining', 'WANT'],
    ['Shopping', 'WANT'],
    ['Investments', 'INVESTMENT'],
    ['Other', null],
  ].map(([name, type]) => ({ id: id('c'), name, type, archived: false }))
  const categoryId = (name) => categories.find((c) => c.name === name).id

  const expenses = []
  if (onboarded) {
    // 23 small expenses spread over the last 10 days, plus one in Other.
    for (let i = 0; i < 23; i++) {
      expenses.push({
        id: id('e'),
        categoryId: categoryId(i % 2 ? 'Dining' : 'Groceries'),
        type: i % 2 ? 'WANT' : 'NEED',
        amountPaise: 10_000 + i * 100,
        expenseDate: addDays(today(), -(9 - (i % 10))),
        description: `Expense ${i + 1}`,
        createdOrder: i,
        createdAt: `${addDays(today(), -(9 - (i % 10)))}T06:30:00Z`,
      })
    }
    expenses.push({
      id: id('e'),
      categoryId: categoryId('Other'),
      type: 'WANT',
      amountPaise: 55_500,
      expenseDate: today(),
      description: 'Gift for Asha',
      createdOrder: 99,
      createdAt: `${today()}T04:54:00Z`,
    })
  }

  state = {
    id,
    resetTokenUsed: false,
    me: {
      id: 'u1',
      email: 'test@example.com',
      name: null,
      showName: true,
      openingBalancePaise: null,
      payDay: onboarded ? 25 : null,
      pendingPayDay: null,
      pendingPayDayFrom: null,
    },
    cycles: onboarded
      ? [
          {
            periodStart: addDays(start, -31),
            periodEnd: addDays(start, -1),
            salaryPaise: 5_000_000,
            ...split(5_000_000),
            salaryConfirmed: true,
          },
          {
            periodStart: start,
            periodEnd: addDays(start, 30),
            salaryPaise: 5_000_000,
            ...split(5_000_000),
            salaryConfirmed,
          },
        ]
      : [],
    categories,
    expenses,
    recurring: [],
  }
}
reset()

const currentCycle = () => state.cycles.at(-1)

function report(cycle) {
  const inCycle = state.expenses.filter((e) => e.expenseDate >= cycle.periodStart && e.expenseDate <= cycle.periodEnd)
  const sum = (type) => inCycle.filter((e) => e.type === type).reduce((total, e) => total + e.amountPaise, 0)
  const needs = sum('NEED')
  const wants = sum('WANT')
  const invested = sum('INVESTMENT')
  const byCategory = new Map()
  for (const e of inCycle) {
    const key = `${e.categoryId}:${e.type}`
    const category = state.categories.find((c) => c.id === e.categoryId)
    const row = byCategory.get(key) ?? {
      categoryId: e.categoryId,
      name: category.name,
      archived: category.archived,
      type: e.type,
      spentPaise: 0,
      expenseCount: 0,
    }
    row.spentPaise += e.amountPaise
    row.expenseCount += 1
    byCategory.set(key, row)
  }
  const saved = cycle.salaryPaise + cycle.bonusPaise - needs - wants
  const total = Math.round((Date.parse(cycle.periodEnd) - Date.parse(cycle.periodStart)) / 86_400_000) + 1
  const elapsed = Math.min(total, Math.round((Date.parse(today()) - Date.parse(cycle.periodStart)) / 86_400_000) + 1)
  const line = (allocated, spent) => ({
    allocatedPaise: allocated,
    spentPaise: spent,
    remainingPaise: allocated - spent,
    overspent: spent > allocated,
  })
  return {
    cycle,
    days: { total, elapsed, remaining: total - elapsed },
    needs: line(cycle.needsPaise, needs),
    wants: line(cycle.wantsPaise, wants),
    savings: { plannedPaise: cycle.savingsPaise, savedPaise: saved, investedPaise: invested, deficit: saved < 0 },
    totalLoggedPaise: needs + wants + invested,
    spendingExceedsSalary: needs + wants + invested > cycle.salaryPaise + cycle.bonusPaise,
    expenseCount: inCycle.length,
    categories: [...byCategory.values()].sort((a, b) => b.spentPaise - a.spentPaise),
    lastExpenseLoggedOn: state.expenses.length ? today() : null,
    daysSinceLastExpenseLogged: state.expenses.length ? 0 : null,
    daily: dailyRows(inCycle),
  }
}

// Sparse, like the API: one row per day and type with something logged, oldest first.
function dailyRows(expenses) {
  const rows = new Map()
  for (const e of expenses) {
    const key = `${e.expenseDate}|${e.type}`
    const row = rows.get(key) ?? { date: e.expenseDate, type: e.type, spentPaise: 0 }
    row.spentPaise += e.amountPaise
    rows.set(key, row)
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date) || a.type.localeCompare(b.type))
}

function historyItem(cycle) {
  const r = report(cycle)
  return {
    cycle,
    needsSpentPaise: r.needs.spentPaise,
    wantsSpentPaise: r.wants.spentPaise,
    investedPaise: r.savings.investedPaise,
    savedPaise: r.savings.savedPaise,
    expenseCount: r.expenseCount,
  }
}

const recurringView = (r) => ({ ...r, due: !r.paused && r.nextDueDate <= today() })

function addExpense(res, body) {
  // Like the API: the same clientId returns the expense already stored.
  const existing = body.clientId && state.expenses.find((e) => e.clientId === body.clientId)
  if (existing) return existing
  const category = state.categories.find((c) => c.id === body.categoryId)
  if (!category) return fail(res, 404, 'Category not found')
  if (category.archived) return fail(res, 409, 'This category is archived')
  if (category.type === null && !body.type) return fail(res, 400, 'Type is required for this category')
  const expense = {
    id: state.id('e'),
    categoryId: category.id,
    type: category.type ?? body.type,
    amountPaise: body.amountPaise,
    expenseDate: body.expenseDate ?? today(),
    description: body.description,
    createdOrder: 1000 + state.expenses.length,
    clientId: body.clientId,
    createdAt: new Date().toISOString(),
  }
  state.expenses.push(expense)
  return expense
}

// The list's filters, like ExpenseFilter on the server: dates, category, type and a description search.
function filtered(params) {
  const from = params.get('from') ?? '1900-01-01'
  const to = params.get('to') ?? '9999-12-31'
  const categoryId = params.get('categoryId')
  const type = params.get('type')
  const q = params.get('q')?.trim().toLowerCase()
  return state.expenses.filter(
    (e) =>
      e.expenseDate >= from &&
      e.expenseDate <= to &&
      (!categoryId || e.categoryId === categoryId) &&
      (!type || e.type === type) &&
      (!q || e.description.toLowerCase().includes(q)),
  )
}

const publicExpense = ({ createdOrder: _order, clientId: _client, ...expense }) => expense

function send(res, status, body) {
  res.writeHead(status, body === undefined ? {} : { 'content-type': 'application/json' })
  res.end(body === undefined ? '' : JSON.stringify(body))
}

function fail(res, status, message) {
  const error = { 400: 'Bad Request', 404: 'Not Found', 409: 'Conflict' }[status]
  send(res, status, { error, message })
}

function handle(req, res, body) {
  const url = new URL(req.url, 'http://localhost')
  const path = url.pathname
  const method = req.method

  if (path === '/__reset') {
    reset(body)
    return send(res, 204)
  }
  if (path === '/api/ping') {
    res.end('ok')
    return
  }
  if (path === '/api/auth/refresh' && state.signedOut) return fail(res, 401, 'Invalid refresh token')
  if (path === '/api/auth/login') {
    // Logging in during the grace period keeps the account.
    const accountRestored = state.deletionScheduled === true
    Object.assign(state, { deletionScheduled: false, signedOut: false })
    return send(res, 200, { accessToken: 'test-token', accountRestored })
  }
  if (path === '/api/auth/register') {
    if (!body.name?.trim()) return fail(res, 400, 'Name is required')
    // Registering signs in as the test user, who starts over without setup.
    reset({ onboarded: false })
    state.me.name = body.name.trim().replace(/\s+/g, ' ')
    return send(res, 201, { accessToken: 'test-token', accountRestored: false })
  }
  if (path === '/api/auth/refresh') {
    return send(res, 200, { accessToken: 'test-token', accountRestored: false })
  }
  if (path === '/api/auth/logout') return send(res, 204)
  if (path === '/api/account/deletion') {
    if (!body.password) return fail(res, 400, 'Password is required')
    if (body.password !== 'password123') return fail(res, 400, 'Password is incorrect')
    // Every session ends: the refresh cookie stops working until the next login.
    Object.assign(state, { deletionScheduled: true, signedOut: true })
    return send(res, 202, { deleteAfter: `${addDays(today(), 7)}T10:00:00+05:30` })
  }
  // Reset flow: any email gets 202; only the token below is "valid", and only once.
  if (path === '/api/auth/forgot-password') return send(res, 202)
  if (path === '/api/auth/reset-password') {
    if (body.token !== 'valid-reset-token' || state.resetTokenUsed) {
      return fail(res, 400, 'This reset link is invalid or has expired. Request a new one.')
    }
    if (!body.password || body.password.length < 8) return fail(res, 400, 'Password must be at least 8 characters')
    state.resetTokenUsed = true
    return send(res, 204)
  }
  if (path === '/api/me') return send(res, 200, state.me)

  if (path === '/api/onboarding') {
    if (state.me.payDay !== null) return fail(res, 409, 'Setup already completed')
    state.me.payDay = body.payDay
    state.me.openingBalancePaise = body.openingBalancePaise ?? null
    const start = addDays(today(), -10)
    state.cycles.push({
      periodStart: start,
      periodEnd: addDays(start, 30),
      salaryPaise: body.salaryPaise,
      ...split(body.salaryPaise, 0, PRESETS[body.split ?? 'BALANCED']),
      salaryConfirmed: true,
    })
    return send(res, 201, { payDay: body.payDay, cycle: currentCycle() })
  }
  if (state.me.payDay === null && path.startsWith('/api/cycles')) return fail(res, 409, 'Complete setup first')

  if (path === '/api/cycles/current') return send(res, 200, currentCycle())
  if (path === '/api/cycles/current/report') return send(res, 200, report(currentCycle()))
  if (path === '/api/cycles/report') {
    const date = url.searchParams.get('date')
    const cycle = state.cycles.find((c) => c.periodStart <= date && date <= c.periodEnd)
    return cycle ? send(res, 200, report(cycle)) : fail(res, 404, 'No cycle contains that date')
  }
  if (path === '/api/cycles/history') {
    const date = url.searchParams.get('date') ?? today()
    const count = Number(url.searchParams.get('count') ?? 6)
    if (!(count >= 1 && count <= 12)) return fail(res, 400, 'Count must be between 1 and 12')
    const index = state.cycles.findIndex((c) => c.periodStart <= date && date <= c.periodEnd)
    if (index < 0) return fail(res, 404, 'No cycle contains that date')
    return send(res, 200, state.cycles.slice(Math.max(0, index - count + 1), index + 1).map(historyItem))
  }
  if (path === '/api/reports/cycles') return send(res, 200, state.cycles.map(historyItem))
  if (path === '/api/reports/categories') {
    const count = Number(url.searchParams.get('count') ?? 6)
    if (!(count >= 1 && count <= 12)) return fail(res, 400, 'Count must be between 1 and 12')
    const cycles = state.cycles.slice(-count)
    const rows = cycles.flatMap((c) => report(c).categories.map((row) => ({ periodStart: c.periodStart, ...row })))
    return send(res, 200, { cycles, rows })
  }
  if (path === '/api/reports/weekly') {
    const weeks = Number(url.searchParams.get('weeks') ?? 8)
    if (!(weeks >= 1 && weeks <= 26)) return fail(res, 400, 'Weeks must be between 1 and 26')
    const [y, m, d] = today().split('-').map(Number)
    const weekday = (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7
    const from = addDays(today(), -weekday - 7 * (weeks - 1))
    const inRange = state.expenses.filter((e) => e.expenseDate >= from && e.expenseDate <= today())
    return send(res, 200, {
      from,
      to: today(),
      cycles: state.cycles.filter((c) => c.periodEnd >= from && c.periodStart <= today()),
      daily: dailyRows(inRange),
    })
  }
  if (path === '/api/cycles/current/salary/confirm') {
    currentCycle().salaryConfirmed = true
    return send(res, 200, currentCycle())
  }
  if (path === '/api/cycles/current/split') {
    if (!PRESETS[body.split]) return fail(res, 400, 'Malformed request body')
    const c = currentCycle()
    Object.assign(c, split(c.salaryPaise, c.bonusPaise, PRESETS[body.split]))
    return send(res, 200, c)
  }
  if (path === '/api/cycles/current/bonus') {
    if (!(body.bonusPaise >= 0)) return fail(res, 400, 'Bonus must be between ₹0 and ₹1,00,00,000')
    const c = currentCycle()
    Object.assign(c, split(c.salaryPaise, body.bonusPaise, pctOf(c)))
    return send(res, 200, c)
  }
  if (path === '/api/cycles/current/salary') {
    const c = currentCycle()
    Object.assign(c, { salaryPaise: body.salaryPaise, ...split(body.salaryPaise, c.bonusPaise, pctOf(c)), salaryConfirmed: true })
    return send(res, 200, currentCycle())
  }
  if (path === '/api/settings/opening-balance') {
    state.me.openingBalancePaise = body.openingBalancePaise ?? null
    return send(res, 200, { openingBalancePaise: state.me.openingBalancePaise })
  }
  if (path === '/api/settings/name') {
    const name = body.name?.trim().replace(/\s+/g, ' ') || null
    if (name && name.length > 50) return fail(res, 400, 'Name must be at most 50 characters')
    state.me.name = name
    if (typeof body.showName === 'boolean') state.me.showName = body.showName
    return send(res, 200, { name, showName: state.me.showName })
  }
  if (path === '/api/settings/pay-day') {
    if (body.payDay === state.me.payDay) {
      Object.assign(state.me, { pendingPayDay: null, pendingPayDayFrom: null })
    } else {
      Object.assign(state.me, { pendingPayDay: body.payDay, pendingPayDayFrom: addDays(currentCycle().periodEnd, 32) })
    }
    const { payDay, pendingPayDay, pendingPayDayFrom } = state.me
    return send(res, 200, { payDay, pendingPayDay, pendingPayDayFrom })
  }

  if (path === '/api/categories' && method === 'GET') {
    const all = url.searchParams.get('includeArchived') === 'true'
    return send(
      res,
      200,
      state.categories.filter((c) => all || !c.archived),
    )
  }
  if (path === '/api/categories' && method === 'POST') {
    if (state.categories.some((c) => c.name.toLowerCase() === body.name.toLowerCase())) {
      return fail(res, 409, 'A category with this name already exists')
    }
    const category = { id: state.id('c'), name: body.name, type: body.type, archived: false }
    state.categories.push(category)
    return send(res, 201, category)
  }
  let match = path.match(/^\/api\/categories\/([^/]+)$/)
  if (match) {
    const category = state.categories.find((c) => c.id === match[1])
    if (!category) return fail(res, 404, 'Category not found')
    if (category.type === null) return fail(res, 409, 'This category cannot be changed')
    if (method === 'DELETE') {
      if (state.expenses.some((e) => e.categoryId === category.id)) {
        return fail(res, 409, 'This category has expenses.')
      }
      if (state.recurring.some((r) => r.categoryId === category.id)) {
        return fail(res, 409, 'A recurring expense uses this category.')
      }
      state.categories = state.categories.filter((c) => c !== category)
      return send(res, 204)
    }
    if (body.name !== undefined) {
      if (state.categories.some((c) => c !== category && c.name.toLowerCase() === body.name.toLowerCase())) {
        return fail(res, 409, 'A category with this name already exists')
      }
      category.name = body.name
    }
    if (body.type !== undefined) category.type = body.type
    if (body.archived !== undefined) category.archived = body.archived
    return send(res, 200, category)
  }

  if (path === '/api/expenses' && method === 'GET') {
    const page = Number(url.searchParams.get('page') ?? 0)
    const size = Number(url.searchParams.get('size') ?? 20)
    const matching = filtered(url.searchParams).sort(
      (a, b) => b.expenseDate.localeCompare(a.expenseDate) || b.createdOrder - a.createdOrder,
    )
    const items = matching.slice(page * size, page * size + size)
    const dates = [...new Set(items.map((e) => e.expenseDate))]
    const sum = (list) => list.reduce((total, e) => total + e.amountPaise, 0)
    return send(res, 200, {
      items: items.map(publicExpense),
      page,
      size,
      totalItems: matching.length,
      totalPages: Math.ceil(matching.length / size),
      totalPaise: items.length ? sum(matching) : 0,
      dayTotals: dates.map((date) => ({ date, totalPaise: sum(matching.filter((e) => e.expenseDate === date)) })),
    })
  }
  if (path === '/api/expenses/export' && method === 'GET') {
    const from = url.searchParams.get('from')
    const to = url.searchParams.get('to')
    const names = new Map(state.categories.map((c) => [c.id, c.name]))
    const labels = { NEED: 'Need', WANT: 'Want', INVESTMENT: 'Investment' }
    const field = (v) => (/[",\r\n]/.test(v) ? `"${v.replaceAll('"', '""')}"` : v)
    const rows = filtered(url.searchParams)
      .sort((a, b) => a.expenseDate.localeCompare(b.expenseDate) || a.createdOrder - b.createdOrder)
      .map((e) =>
        [
          e.expenseDate,
          field(e.description),
          field(names.get(e.categoryId)),
          labels[e.type],
          (e.amountPaise / 100).toFixed(2),
        ].join(','),
      )
    const filename = from || to ? `fifty30-expenses-${from ?? 'start'}-to-${to ?? 'today'}.csv` : 'fifty30-expenses.csv'
    res.writeHead(200, {
      'content-type': 'text/csv; charset=UTF-8',
      'content-disposition': `attachment; filename="${filename}"`,
    })
    return res.end('\uFEFF' + ['Date,Description,Category,Type,Amount (INR)', ...rows].map((r) => r + '\r\n').join(''))
  }
  if (path === '/api/expenses' && method === 'POST') {
    const expense = addExpense(res, body)
    return expense && send(res, 201, publicExpense(expense))
  }
  match = path.match(/^\/api\/expenses\/([^/]+)$/)
  if (match) {
    const expense = state.expenses.find((e) => e.id === match[1])
    if (!expense) return fail(res, 404, 'Expense not found')
    if (method === 'DELETE') {
      state.expenses = state.expenses.filter((e) => e !== expense)
      return send(res, 204)
    }
    const category = state.categories.find((c) => c.id === body.categoryId)
    if (!category) return fail(res, 404, 'Category not found')
    if (category.type === null && !body.type) return fail(res, 400, 'Type is required for this category')
    if (category.type !== null && body.type) return fail(res, 400, 'Type must not be sent for this category')
    if (category.archived && category.id !== expense.categoryId) return fail(res, 409, 'This category is archived')
    Object.assign(expense, {
      categoryId: category.id,
      type: category.type ?? body.type,
      amountPaise: body.amountPaise,
      expenseDate: body.expenseDate,
      description: body.description,
    })
    return send(res, 200, publicExpense(expense))
  }

  if (path === '/api/recurring-expenses' && method === 'GET') {
    const sorted = state.recurring
      .map(recurringView)
      .sort((a, b) => Number(b.due) - Number(a.due) || a.nextDueDate.localeCompare(b.nextDueDate))
    return send(res, 200, sorted)
  }
  if (path === '/api/recurring-expenses' && method === 'POST') {
    const category = state.categories.find((c) => c.id === body.categoryId)
    if (!category) return fail(res, 404, 'Category not found')
    if (category.type === null && !body.type) return fail(res, 400, 'Type is required for this category')
    const recurring = {
      id: state.id('r'),
      categoryId: category.id,
      type: category.type === null ? body.type : null,
      amountPaise: body.amountPaise,
      description: body.description.trim(),
      dayOfMonth: body.dayOfMonth,
      nextDueDate: firstOnOrAfter(today(), body.dayOfMonth),
      paused: false,
    }
    state.recurring.push(recurring)
    return send(res, 201, recurringView(recurring))
  }
  match = path.match(/^\/api\/recurring-expenses\/([^/]+)(?:\/(confirm|skip))?$/)
  if (match) {
    const recurring = state.recurring.find((r) => r.id === match[1])
    if (!recurring) return fail(res, 404, 'Recurring expense not found')
    const action = match[2]
    if (action) {
      if (body.dueDate !== recurring.nextDueDate) return fail(res, 409, 'This payment was already handled')
      if (recurring.paused) return fail(res, 409, 'This recurring expense is paused')
      if (body.dueDate > today()) return fail(res, 409, 'This payment is not due yet')
      let expense = null
      if (action === 'confirm') {
        expense = addExpense(res, {
          categoryId: recurring.categoryId,
          type: recurring.type,
          amountPaise: body.amountPaise,
          expenseDate: body.expenseDate ?? body.dueDate,
          description: recurring.description,
        })
        if (!expense) return
      }
      recurring.nextDueDate = following(recurring.nextDueDate, recurring.dayOfMonth)
      return action === 'confirm'
        ? send(res, 201, { expense: publicExpense(expense), recurring: recurringView(recurring) })
        : send(res, 200, recurringView(recurring))
    }
    if (method === 'DELETE') {
      state.recurring = state.recurring.filter((r) => r !== recurring)
      return send(res, 204)
    }
    const category = state.categories.find((c) => c.id === body.categoryId)
    if (!category) return fail(res, 404, 'Category not found')
    if (body.dayOfMonth !== recurring.dayOfMonth) {
      const [y, m] = recurring.nextDueDate.split('-').map(Number)
      recurring.nextDueDate = occurrenceIn(y, m, body.dayOfMonth)
    }
    if (recurring.paused && !body.paused && recurring.nextDueDate < today()) {
      recurring.nextDueDate = firstOnOrAfter(today(), body.dayOfMonth)
    }
    Object.assign(recurring, {
      categoryId: category.id,
      type: category.type === null ? body.type : null,
      amountPaise: body.amountPaise,
      description: body.description.trim(),
      dayOfMonth: body.dayOfMonth,
      paused: body.paused,
    })
    return send(res, 200, recurringView(recurring))
  }

  fail(res, 404, 'Not found')
}

http
  .createServer((req, res) => {
    let raw = ''
    req.on('data', (chunk) => (raw += chunk))
    req.on('end', () => {
      try {
        handle(req, res, raw ? JSON.parse(raw) : {})
      } catch (error) {
        console.error(error)
        send(res, 500, { error: 'Internal Server Error', message: 'Mock API error' })
      }
    })
  })
  .listen(PORT, () => console.log(`Mock API on http://localhost:${PORT}`))
