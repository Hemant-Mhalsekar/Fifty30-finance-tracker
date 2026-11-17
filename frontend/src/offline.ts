import type { Category, Me, NewExpense } from './api'

// What the phone keeps so expenses can be added without a connection. Only small, non-secret
// data: the user's id, email and pay day, the category list, and expenses waiting to be sent.
// The access token is never stored. Everything is per user, so a different account on the same
// phone never sends (or sees) someone else's waiting expenses.

export type PendingExpense = {
  // Sent as clientId: the server stores the expense once even if it is sent twice.
  clientId: string
  userId: string
  expense: NewExpense
  categoryName: string
  savedAt: string
  // Set when the server refused it (for example an archived category); it waits for the user.
  error?: string
}

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

const KEYS = { me: 'fifty30-me', categories: 'fifty30-categories', pending: 'fifty30-pending' }
const CHANGE_EVENT = 'fifty30-pending-change'

// Storage can be missing or throw (private mode, blocked site data); then nothing is kept.
function store(): Store | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

function read<T>(key: string, s: Store | null = store()): T | null {
  try {
    const raw = s?.getItem(key)
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

function write(key: string, value: unknown, s: Store | null = store()): boolean {
  try {
    if (!s) return false
    s.setItem(key, JSON.stringify(value))
    return true
  } catch {
    return false
  }
}

// --- the signed-in user and categories, for opening the app offline ---

export function rememberUser(me: Me): void {
  write(KEYS.me, me)
}

export function rememberedUser(): Me | null {
  return read<Me>(KEYS.me)
}

export function rememberCategories(userId: string, categories: Category[]): void {
  write(KEYS.categories, { userId, categories })
}

export function rememberedCategories(userId: string): Category[] | null {
  const saved = read<{ userId: string; categories: Category[] }>(KEYS.categories)
  return saved && saved.userId === userId ? saved.categories : null
}

/** On log out: forget the user and categories, but keep their waiting expenses for next time. */
export function forgetUser(): void {
  try {
    store()?.removeItem(KEYS.me)
    store()?.removeItem(KEYS.categories)
  } catch {
    // nothing to forget
  }
}

// --- expenses waiting to be sent ---

/** The stored list as text: a cheap, stable snapshot for React's useSyncExternalStore. */
export function pendingSnapshot(): string | null {
  try {
    return store()?.getItem(KEYS.pending) ?? null
  } catch {
    return null
  }
}

/** Parses a snapshot from pendingSnapshot for one user. */
export function parsePending(snapshot: string | null, userId: string): PendingExpense[] {
  try {
    const all = snapshot ? (JSON.parse(snapshot) as PendingExpense[]) : []
    return all.filter((p) => p.userId === userId)
  } catch {
    return []
  }
}

export function pendingExpenses(userId: string, s: Store | null = store()): PendingExpense[] {
  return (read<PendingExpense[]>(KEYS.pending, s) ?? []).filter((p) => p.userId === userId)
}

function updatePending(change: (all: PendingExpense[]) => PendingExpense[], s: Store | null = store()): boolean {
  const ok = write(KEYS.pending, change(read<PendingExpense[]>(KEYS.pending, s) ?? []), s)
  if (ok && typeof window !== 'undefined') window.dispatchEvent(new Event(CHANGE_EVENT))
  return ok
}

/** False when the phone cannot store it (then the caller must say it was not saved). */
export function addPending(item: PendingExpense, s?: Store | null): boolean {
  return updatePending((all) => [...all.filter((p) => p.clientId !== item.clientId), item], s)
}

export function removePending(clientId: string, s?: Store | null): void {
  updatePending((all) => all.filter((p) => p.clientId !== clientId), s)
}

export function setPendingError(clientId: string, error: string | undefined, s?: Store | null): void {
  updatePending((all) => all.map((p) => (p.clientId === clientId ? { ...p, error } : p)), s)
}

/** Calls the listener whenever the waiting list changes, in this tab or another one. */
export function onPendingChange(listener: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEYS.pending) listener()
  }
  window.addEventListener(CHANGE_EVENT, listener)
  window.addEventListener('storage', onStorage)
  return () => {
    window.removeEventListener(CHANGE_EVENT, listener)
    window.removeEventListener('storage', onStorage)
  }
}

/** A random UUID for clientId, with a fallback for browsers without crypto.randomUUID. */
export function newClientId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

// --- sending ---

export type SendResult = 'sent' | 'retry-later' | { refused: string }

/**
 * Sends the user's waiting expenses oldest first. Stops at the first network or server failure
 * (still offline, or the server is waking up) so they keep their order; a refusal (4xx) is kept
 * with its message for the user to fix or discard, and the rest carry on.
 */
export async function sendPending(
  userId: string,
  send: (item: PendingExpense) => Promise<SendResult>,
  s: Store | null = store(),
): Promise<{ sent: number; stopped: boolean }> {
  let sent = 0
  for (const item of pendingExpenses(userId, s)) {
    if (item.error) continue
    const result = await send(item)
    if (result === 'sent') {
      removePending(item.clientId, s)
      sent++
    } else if (result === 'retry-later') {
      return { sent, stopped: true }
    } else {
      setPendingError(item.clientId, result.refused, s)
    }
  }
  return { sent, stopped: false }
}

/** Whether a failed request should wait and be tried again, rather than be shown as refused. */
export function isRetryable(status: number): boolean {
  // 0: no network. 401: the session needs renewing first. 408/429/5xx: try again later.
  return status === 0 || status === 401 || status === 408 || status === 429 || status >= 500
}
