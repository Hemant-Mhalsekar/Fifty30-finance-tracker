import { afterEach, describe, expect, it, vi } from 'vitest'
import type { RecurringExpense } from './api'
import { dueCount, showDueOnAppIcon } from './appBadge'
import { installSnoozed, snoozeInstall, SNOOZE_DAYS } from './installPrompt'

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('app badge', () => {
  it('counts only payments waiting for an answer and clears at zero', async () => {
    const items = [{ due: true }, { due: false }, { due: true }] as RecurringExpense[]
    expect(dueCount(items)).toBe(2)

    const setAppBadge = vi.fn().mockResolvedValue(undefined)
    const clearAppBadge = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { setAppBadge, clearAppBadge })
    await showDueOnAppIcon(2)
    expect(setAppBadge).toHaveBeenCalledWith(2)
    await showDueOnAppIcon(0)
    expect(clearAppBadge).toHaveBeenCalled()
  })

  it('does nothing where the Badging API is missing or refused', async () => {
    vi.stubGlobal('navigator', {})
    await expect(showDueOnAppIcon(3)).resolves.toBeUndefined()
    vi.stubGlobal('navigator', { setAppBadge: vi.fn().mockRejectedValue(new Error('NotAllowed')) })
    await expect(showDueOnAppIcon(3)).resolves.toBeUndefined()
  })
})

describe('install suggestion', () => {
  it('"Not now" hides it for 30 days on this device', () => {
    const store = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => store.set(k, v),
    })
    const now = Date.parse('2026-11-28T10:00:00Z')
    expect(installSnoozed(now)).toBe(false)
    snoozeInstall(now)
    expect(installSnoozed(now + 86_400_000)).toBe(true)
    expect(installSnoozed(now + SNOOZE_DAYS * 86_400_000)).toBe(false)
  })

  it('shows normally when storage is blocked', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('SecurityError')
      },
    })
    expect(() => snoozeInstall()).not.toThrow()
    expect(installSnoozed()).toBe(false)
  })
})
