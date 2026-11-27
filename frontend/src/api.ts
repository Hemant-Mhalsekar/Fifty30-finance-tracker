import { cachedGet, clearApiCache } from './apiCache'
import { errorMessage } from './errors'
import type { SplitPreset } from './splits'

// The access token lives only in this module variable (never in any browser storage).
// It is lost on page reload; the HttpOnly refresh cookie is used to get a new one.
let accessToken: string | null = null

// Every new token (login, refresh, logout) starts with an empty answer cache, so one person's
// data can never be shown to the next person on the same device.
function setAccessToken(token: string | null) {
  accessToken = token
  clearApiCache()
}

const AUTH_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
]

const PING_INTERVAL_MS = 3_000
const PING_TIMEOUT_MS = 10_000
// A Render free-tier cold start takes about 140 s, so give up only well after that.
const PING_MAX_TOTAL_MS = 180_000

// --- "logged out" notifications ---

const loggedOutListeners = new Set<() => void>()

/** Subscribe to "the session ended" events. Returns an unsubscribe function. */
export function onLoggedOut(listener: () => void): () => void {
  loggedOutListeners.add(listener)
  return () => {
    loggedOutListeners.delete(listener)
  }
}

function notifyLoggedOut() {
  loggedOutListeners.forEach((listener) => listener())
}

// --- core fetch ---

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const isAuthPath = AUTH_PATHS.includes(path)

  function send(): Promise<Response> {
    const headers = new Headers(options.headers)
    // Auth endpoints are public; an old token there would only cause a pointless 401.
    if (accessToken && !isAuthPath) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }
    return fetch(path, { ...options, headers, credentials: 'same-origin' })
  }

  const response = await send()
  if (response.status !== 401 || isAuthPath) {
    return response
  }

  // Access token probably expired: refresh once and retry the original request once.
  const session = await refreshSession()
  if (session === 'ok') {
    return send()
  }
  if (session === 'unreachable') {
    // Still signed in: only the network or the server failed. The page shows the message.
    return new Response(JSON.stringify({ error: 'Unavailable', message: SESSION_UNREACHABLE_MESSAGE }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  notifyLoggedOut()
  return response
}

// --- refresh ---

/**
 * ok: a new access token. loggedOut: the server refused the refresh cookie (the session has ended).
 * unreachable: no answer or a server error, so it is unknown; the user stays signed in.
 */
export type RefreshResult = 'ok' | 'loggedOut' | 'unreachable'

export const SESSION_UNREACHABLE_MESSAGE =
  'Could not reach the server to renew your session. You are still signed in; please try again in a minute.'

// One retry only: the server accepts a just-replaced refresh token once more for 2 minutes (for a
// response that never arrived), but a third use counts as theft and ends every session.
const REFRESH_ATTEMPTS = 2
export const REFRESH_RETRY_DELAY_MS = 1_500

let refreshInFlight: Promise<RefreshResult> | null = null

/** Gets a new access token using the refresh cookie. Simultaneous callers share one request. */
export function refreshSession(): Promise<RefreshResult> {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}

async function doRefresh(): Promise<RefreshResult> {
  for (let attempt = 1; ; attempt++) {
    const result = await refreshOnce()
    if (result !== 'unreachable' || attempt === REFRESH_ATTEMPTS) return result
    await new Promise((resolve) => setTimeout(resolve, REFRESH_RETRY_DELAY_MS))
  }
}

async function refreshOnce(): Promise<RefreshResult> {
  let response: Response
  try {
    response = await apiFetch('/api/auth/refresh', { method: 'POST' })
  } catch {
    return 'unreachable'
  }
  // A 5xx (Vercel could not reach Render, or the server failed) says nothing about the session.
  if (response.status >= 500) return 'unreachable'
  if (!response.ok) {
    setAccessToken(null)
    return 'loggedOut'
  }
  try {
    const token = await readAccessToken(response)
    if (token) {
      setAccessToken(token)
      return 'ok'
    }
  } catch {
    // The body was cut off; the new cookie arrived with the headers, so a retry works normally.
  }
  return 'unreachable'
}

// --- cold start ---

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(done, ms)
    function done() {
      window.clearTimeout(timer)
      signal?.removeEventListener('abort', done)
      resolve()
    }
    signal?.addEventListener('abort', done)
  })
}

/**
 * Polls GET /api/ping until the server answers "ok". Only for cold starts.
 * Pass a signal to stop polling early (for example on unmount).
 *
 * A sleeping server answers slowly or with a 5xx through Vercel; no network at all makes fetch
 * fail at once. Two instant failures in a row therefore mean "offline", even when the browser
 * still claims to be online (Wi-Fi without internet).
 */
export type ServerState = 'up' | 'down' | 'offline'

const OFFLINE_AFTER_NETWORK_ERRORS = 2

export async function waitForServer(signal?: AbortSignal): Promise<ServerState> {
  const deadline = Date.now() + PING_MAX_TOTAL_MS
  let networkErrorsInARow = 0

  while (!signal?.aborted && Date.now() < deadline) {
    const controller = new AbortController()
    const abort = () => controller.abort()
    const timeout = window.setTimeout(abort, Math.min(PING_TIMEOUT_MS, deadline - Date.now()))
    signal?.addEventListener('abort', abort)

    try {
      const response = await fetch('/api/ping', { signal: controller.signal })
      networkErrorsInARow = 0
      if (response.status === 200 && (await response.text()).trim() === 'ok') {
        return 'up'
      }
    } catch {
      // A timeout means the server is probably still starting; an instant failure means no network.
      networkErrorsInARow = controller.signal.aborted ? 0 : networkErrorsInARow + 1
      if (networkErrorsInARow >= OFFLINE_AFTER_NETWORK_ERRORS && !signal?.aborted) {
        return 'offline'
      }
    } finally {
      window.clearTimeout(timeout)
      signal?.removeEventListener('abort', abort)
    }

    await sleep(PING_INTERVAL_MS, signal)
  }
  return 'down'
}

// --- auth calls ---

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await response.json()
    return typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : null
  } catch {
    return null
  }
}

async function readAccessToken(response: Response): Promise<string | null> {
  const body = await readJson(response)
  return typeof body?.accessToken === 'string' ? body.accessToken : null
}

// Resolves to true when this login cancelled a scheduled account deletion.
async function authenticate(path: string, payload: Record<string, string>): Promise<boolean> {
  let response: Response
  try {
    response = await apiFetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  } catch {
    throw new Error('Something went wrong')
  }

  if (!response.ok) {
    throw new Error(errorMessage(response.status, await readJson(response)))
  }

  const body = await readJson(response)
  const token = typeof body?.accessToken === 'string' ? body.accessToken : null
  if (!token) {
    throw new Error('Something went wrong')
  }
  setAccessToken(token)
  return body?.accountRestored === true
}

/** The name is required (up to 50 characters) and used in the greeting. */
export function register(email: string, password: string, name: string): Promise<boolean> {
  return authenticate('/api/auth/register', { email, password, name })
}

export function login(email: string, password: string): Promise<boolean> {
  return authenticate('/api/auth/login', { email, password })
}

/** Ends the session on the server, then forgets the token whatever the response was. */
export async function logout(): Promise<void> {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' })
  } catch {
    // Ignored: the token is cleared below either way.
  } finally {
    setAccessToken(null)
  }
}

// --- typed API calls ---
// Response shapes are trusted as the backend's documented contract (see CLAUDE.md, API section).

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// GETs come from the short-lived cache (apiCache.ts); anything else clears it, because it may
// have changed what the GETs would answer.
function requestJson<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? 'GET').toUpperCase()
  if (method === 'GET') return cachedGet(path, () => sendRequest<T>(path, init))
  return sendRequest<T>(path, init).finally(clearApiCache)
}

async function sendRequest<T>(path: string, init: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await apiFetch(path, init)
  } catch {
    throw new ApiError(0, 'Could not reach the server')
  }
  const body: unknown = response.status === 204 ? null : await response.json().catch(() => null)
  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(response.status, body))
  }
  return body as T
}

function sendJson<T>(path: string, method: string, payload: unknown): Promise<T> {
  return requestJson<T>(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export type BudgetType = 'NEED' | 'WANT' | 'INVESTMENT'

export type Me = {
  id: string
  email: string
  // For the greeting; null until the user gives one.
  name: string | null
  // Settings switch: false greets without the name (it stays saved).
  showName: boolean
  // Savings the user had before using the app; null when none given.
  openingBalancePaise: number | null
  payDay: number | null
  pendingPayDay: number | null
  pendingPayDayFrom: string | null
}

export function getMe(): Promise<Me> {
  return requestJson<Me>('/api/me')
}

export type Cycle = {
  periodStart: string
  periodEnd: string
  salaryPaise: number
  needsPaise: number
  wantsPaise: number
  savingsPaise: number
  // False until "Did your salary change?" is answered for this cycle.
  salaryConfirmed: boolean
  // Extra money for this cycle only; the three allocations are split from salary + bonus.
  bonusPaise: number
  needsPct: number
  wantsPct: number
  savingsPct: number
}

export function onboard(
  salaryPaise: number,
  payDay: number,
  split: SplitPreset,
  openingBalancePaise: number | null,
): Promise<{ payDay: number; cycle: Cycle }> {
  return sendJson('/api/onboarding', 'POST', { salaryPaise, payDay, split, openingBalancePaise })
}

/** From the current cycle onward; past cycles keep their split. */
export function changeSplit(split: SplitPreset): Promise<Cycle> {
  return sendJson<Cycle>('/api/cycles/current/split', 'PUT', { split })
}

/** The current cycle's bonus, split like the salary. 0 removes it. */
export function changeBonus(bonusPaise: number): Promise<Cycle> {
  return sendJson<Cycle>('/api/cycles/current/bonus', 'PUT', { bonusPaise })
}

/** null removes it. */
export function changeOpeningBalance(
  openingBalancePaise: number | null,
): Promise<{ openingBalancePaise: number | null }> {
  return sendJson('/api/settings/opening-balance', 'PUT', { openingBalancePaise })
}

/** Blank clears the name. showName false greets without it but keeps it saved. */
export function changeName(name: string, showName: boolean): Promise<{ name: string | null; showName: boolean }> {
  return sendJson('/api/settings/name', 'PUT', { name, showName })
}

export type BudgetLine = {
  allocatedPaise: number
  spentPaise: number
  remainingPaise: number
  overspent: boolean
}

export type CategorySpend = {
  categoryId: string
  name: string
  archived: boolean
  type: BudgetType
  spentPaise: number
  expenseCount: number
}

export type CycleReport = {
  cycle: Cycle
  days: { total: number; elapsed: number; remaining: number }
  needs: BudgetLine
  wants: BudgetLine
  savings: { plannedPaise: number; savedPaise: number; investedPaise: number; deficit: boolean }
  totalLoggedPaise: number
  spendingExceedsSalary: boolean
  expenseCount: number
  categories: CategorySpend[]
  lastExpenseLoggedOn: string | null
  daysSinceLastExpenseLogged: number | null
  // One row per day and type with something logged, oldest first.
  daily: { date: string; type: BudgetType; spentPaise: number }[]
}

export function getCurrentCycle(): Promise<Cycle> {
  return requestJson<Cycle>('/api/cycles/current')
}

export function changeCurrentSalary(salaryPaise: number): Promise<Cycle> {
  return sendJson<Cycle>('/api/cycles/current/salary', 'PUT', { salaryPaise })
}

/** "Same as before": keeps the salary copied from the last cycle and stops asking for this cycle. */
export function confirmCurrentSalary(): Promise<Cycle> {
  return sendJson<Cycle>('/api/cycles/current/salary/confirm', 'POST', {})
}

export type PayDaySettings = { payDay: number; pendingPayDay: number | null; pendingPayDayFrom: string | null }

/** Takes effect after one full cycle. Sending the current pay day cancels a pending change. */
export function changePayDay(payDay: number): Promise<PayDaySettings> {
  return sendJson<PayDaySettings>('/api/settings/pay-day', 'PUT', { payDay })
}

export function getCurrentReport(): Promise<CycleReport> {
  return requestJson<CycleReport>('/api/cycles/current/report')
}

/** Report for the stored cycle containing the date. Throws ApiError 404 if there is none. */
export function getReportForDate(isoDate: string): Promise<CycleReport> {
  return requestJson<CycleReport>(`/api/cycles/report?date=${encodeURIComponent(isoDate)}`)
}

export type CycleHistoryItem = {
  cycle: Cycle
  needsSpentPaise: number
  wantsSpentPaise: number
  investedPaise: number
  // Salary - needs - wants; negative is a deficit.
  savedPaise: number
  // A cycle with nothing logged "saves" its whole salary; the savings report leaves those out.
  expenseCount: number
}

/** Every stored cycle with its totals, oldest first. */
export function getAllCycles(): Promise<CycleHistoryItem[]> {
  return requestJson<CycleHistoryItem[]>('/api/reports/cycles')
}

export type WeeklyData = {
  // A Monday.
  from: string
  // Today.
  to: string
  cycles: Cycle[]
  daily: { date: string; type: BudgetType; spentPaise: number }[]
}

/** The last `weeks` Monday-to-Sunday weeks up to today. */
export function getWeekly(weeks = 8): Promise<WeeklyData> {
  return requestJson<WeeklyData>(`/api/reports/weekly?weeks=${weeks}`)
}

export type CycleCategorySpend = {
  // The cycle's start.
  periodStart: string
  categoryId: string
  name: string
  archived: boolean
  // The type the expenses were logged with; Other can appear once per type.
  type: BudgetType
  spentPaise: number
  expenseCount: number
}

export type CategoryTrends = {
  // The last cycles up to the current one, oldest first.
  cycles: Cycle[]
  // Oldest cycle first, biggest category first.
  rows: CycleCategorySpend[]
}

export function getCategoryTrends(count = 6): Promise<CategoryTrends> {
  return requestJson<CategoryTrends>(`/api/reports/categories?count=${count}`)
}

/** The cycles that start in a calendar year, oldest first, with spending per category in each. */
export function getYearReport(year: number): Promise<CategoryTrends> {
  return requestJson<CategoryTrends>(`/api/reports/year?year=${year}`)
}

/** The cycle containing the date (today if left out) and up to count - 1 before it, oldest first. */
export function getHistory(date?: string, count = 6): Promise<CycleHistoryItem[]> {
  const params = new URLSearchParams({ count: String(count) })
  if (date) params.set('date', date)
  return requestJson<CycleHistoryItem[]>(`/api/cycles/history?${params}`)
}

export type Category = { id: string; name: string; type: BudgetType | null; archived: boolean }

export function listCategories(includeArchived = false): Promise<Category[]> {
  return requestJson<Category[]>(`/api/categories${includeArchived ? '?includeArchived=true' : ''}`)
}

export function createCategory(name: string, type: BudgetType): Promise<Category> {
  return sendJson<Category>('/api/categories', 'POST', { name, type })
}

/** Only the fields given are changed. Other (type null) cannot be changed at all. */
export function updateCategory(
  id: string,
  changes: { name?: string; type?: BudgetType; archived?: boolean },
): Promise<Category> {
  return sendJson<Category>(`/api/categories/${encodeURIComponent(id)}`, 'PATCH', changes)
}

/** Fails with 409 when the category still has expenses; archiving is the alternative. */
export async function deleteCategory(id: string): Promise<void> {
  await requestJson<null>(`/api/categories/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export type Expense = {
  id: string
  categoryId: string
  type: BudgetType
  amountPaise: number
  expenseDate: string
  description: string
  // When it was logged (ISO with offset), not when the money was spent.
  createdAt: string | null
}

export type NewExpense = {
  amountPaise: number
  categoryId: string
  description: string
  expenseDate: string
  // Only for categories without a type (Other); the API rejects it otherwise.
  type?: BudgetType
  // Makes the request safe to repeat: the server stores one expense per id.
  clientId?: string
}

export function createExpense(expense: NewExpense): Promise<Expense> {
  return sendJson<Expense>('/api/expenses', 'POST', expense)
}

export function updateExpense(id: string, expense: NewExpense): Promise<Expense> {
  return sendJson<Expense>(`/api/expenses/${encodeURIComponent(id)}`, 'PUT', expense)
}

export async function deleteExpense(id: string): Promise<void> {
  await requestJson<null>(`/api/expenses/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

export type ExpensePage = {
  items: Expense[]
  page: number
  size: number
  totalItems: number
  totalPages: number
  // Every match, not only this page.
  totalPaise: number
  // One per date on this page, counting matches on other pages too. Newest first.
  dayTotals: { date: string; totalPaise: number }[]
}

export type ExpenseQuery = {
  from?: string
  to?: string
  categoryId?: string
  type?: BudgetType | ''
  // Searches descriptions (contains, any case).
  q?: string
  page?: number
  size?: number
}

/** Newest first. Pages start at 0; size is at most 100. */
export function listExpenses(query: ExpenseQuery): Promise<ExpensePage> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  const search = params.toString()
  return requestJson<ExpensePage>(`/api/expenses${search ? `?${search}` : ''}`)
}

/** The matching expenses as a CSV file (oldest first), with the file name the server chose. */
export async function exportExpensesCsv(
  query: Pick<ExpenseQuery, 'from' | 'to' | 'categoryId' | 'type' | 'q'>,
): Promise<{ filename: string; blob: Blob }> {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value))
  }
  let response: Response
  try {
    response = await apiFetch(`/api/expenses/export?${params}`)
  } catch {
    throw new ApiError(0, 'Could not reach the server')
  }
  if (!response.ok) {
    throw new ApiError(response.status, errorMessage(response.status, await response.json().catch(() => null)))
  }
  const disposition = response.headers.get('Content-Disposition') ?? ''
  const filename = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'fifty30-expenses.csv'
  return { filename, blob: await response.blob() }
}

export type Frequency = 'WEEKLY' | 'MONTHLY' | 'YEARLY'

/**
 * When it comes due. Only the fields of the frequency are set: WEEKLY dayOfWeek (1 = Monday ...
 * 7 = Sunday), MONTHLY dayOfMonth, YEARLY monthOfYear (1-12) and dayOfMonth.
 */
export type RecurringSchedule = {
  frequency: Frequency
  dayOfMonth: number | null
  dayOfWeek: number | null
  monthOfYear: number | null
}

/** type is set only for categories without a fixed type (Other). due = waiting for Confirm or Skip. */
export type RecurringExpense = RecurringSchedule & {
  id: string
  categoryId: string
  type: BudgetType | null
  amountPaise: number
  description: string
  nextDueDate: string
  paused: boolean
  due: boolean
}

export type RecurringInput = RecurringSchedule & {
  categoryId: string
  type?: BudgetType
  amountPaise: number
  description: string
}

/** Due ones first, then by next due date. */
export function listRecurring(): Promise<RecurringExpense[]> {
  return requestJson<RecurringExpense[]>('/api/recurring-expenses')
}

export function createRecurring(input: RecurringInput): Promise<RecurringExpense> {
  return sendJson<RecurringExpense>('/api/recurring-expenses', 'POST', input)
}

/** Full replace. Changing the day keeps the month that is waiting; resuming skips months missed while paused. */
export function updateRecurring(id: string, input: RecurringInput & { paused: boolean }): Promise<RecurringExpense> {
  return sendJson<RecurringExpense>(`/api/recurring-expenses/${encodeURIComponent(id)}`, 'PUT', input)
}

export async function deleteRecurring(id: string): Promise<void> {
  await requestJson<null>(`/api/recurring-expenses/${encodeURIComponent(id)}`, { method: 'DELETE' })
}

/**
 * Logs the expense for dueDate and moves on a month. dueDate guards against adding it twice:
 * if another tap or device already answered it, the server returns 409.
 */
export function confirmRecurring(
  id: string,
  dueDate: string,
  amountPaise: number,
): Promise<{ expense: Expense; recurring: RecurringExpense }> {
  return sendJson(`/api/recurring-expenses/${encodeURIComponent(id)}/confirm`, 'POST', { dueDate, amountPaise })
}

/** Moves on a month without logging anything. */
export function skipRecurring(id: string, dueDate: string): Promise<RecurringExpense> {
  return sendJson<RecurringExpense>(`/api/recurring-expenses/${encodeURIComponent(id)}/skip`, 'POST', { dueDate })
}

/**
 * Schedules the account for deletion in 7 days and ends every session. Logging in before then
 * keeps the account. A wrong password is a 400 (so it does not look like a logged-out session).
 */
export function requestAccountDeletion(password: string): Promise<{ deleteAfter: string }> {
  return sendJson<{ deleteAfter: string }>('/api/account/deletion', 'POST', { password })
}

/** Asks for a reset email. The server answers the same whether or not the account exists. */
export async function requestPasswordReset(email: string): Promise<void> {
  await sendJson<null>('/api/auth/forgot-password', 'POST', { email })
}

/** Sets a new password using the token from the email link. Logs out every session. */
export async function resetPassword(token: string, password: string): Promise<void> {
  await sendJson<null>('/api/auth/reset-password', 'POST', { token, password })
}
