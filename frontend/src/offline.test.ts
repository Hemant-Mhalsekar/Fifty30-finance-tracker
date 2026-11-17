import { beforeEach, describe, expect, it, vi } from 'vitest'
import { addPending, isRetryable, newClientId, pendingExpenses, sendPending, type PendingExpense } from './offline'

// An in-memory stand-in for localStorage.
function memoryStore() {
  const data = new Map<string, string>()
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  }
}

const item = (clientId: string, userId = 'u1'): PendingExpense => ({
  clientId,
  userId,
  expense: { amountPaise: 100, categoryId: 'c1', description: clientId, expenseDate: '2026-11-18' },
  categoryName: 'Dining',
  savedAt: '2026-11-18T10:00:00Z',
})

describe('pending expenses', () => {
  let store: ReturnType<typeof memoryStore>
  beforeEach(() => {
    store = memoryStore()
    // window events are not needed here.
    vi.stubGlobal('window', { dispatchEvent: () => true })
  })

  it('keeps each user apart and replaces an item with the same id', () => {
    addPending(item('a'), store)
    addPending(item('b', 'u2'), store)
    addPending({ ...item('a'), categoryName: 'Rent' }, store)
    expect(pendingExpenses('u1', store).map((p) => [p.clientId, p.categoryName])).toEqual([['a', 'Rent']])
    expect(pendingExpenses('u2', store)).toHaveLength(1)
  })

  it('sends oldest first, stops at the first failure to retry, and keeps refusals with their message', async () => {
    for (const id of ['a', 'b', 'c', 'd']) addPending(item(id), store)
    const send = vi.fn(async (p: PendingExpense) => {
      if (p.clientId === 'b') return { refused: 'This category is archived' }
      if (p.clientId === 'c') return 'retry-later' as const
      return 'sent' as const
    })

    expect(await sendPending('u1', send, store)).toEqual({ sent: 1, stopped: true })
    expect(send.mock.calls.map(([p]) => p.clientId)).toEqual(['a', 'b', 'c'])
    expect(pendingExpenses('u1', store).map((p) => [p.clientId, p.error])).toEqual([
      ['b', 'This category is archived'],
      ['c', undefined],
      ['d', undefined],
    ])

    // Next time: the refused one is skipped until the user acts on it.
    send.mockImplementation(async () => 'sent' as const)
    expect(await sendPending('u1', send, store)).toEqual({ sent: 2, stopped: false })
    expect(pendingExpenses('u1', store).map((p) => p.clientId)).toEqual(['b'])
  })
})

describe('isRetryable', () => {
  it.each([
    [0, true],
    [401, true],
    [429, true],
    [502, true],
    [400, false],
    [404, false],
    [409, false],
  ])('%i -> %s', (status, expected) => {
    expect(isRetryable(status)).toBe(expected)
  })
})

describe('newClientId', () => {
  it('makes version 4 UUIDs', () => {
    expect(newClientId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})
