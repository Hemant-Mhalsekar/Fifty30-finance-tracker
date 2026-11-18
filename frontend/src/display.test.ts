import { describe, expect, it } from 'vitest'
import type { CategorySpend, CycleReport } from './api'
import {
  dayLabel,
  daysLeftLabel,
  donutSlices,
  firstName,
  greeting,
  initial,
  loggedTime,
  paceStatus,
  percentOf,
} from './display'

describe('greeting', () => {
  it('follows the time of day in India', () => {
    // 03:30 UTC = 09:00 IST, 08:30 UTC = 14:00 IST, 14:30 UTC = 20:00 IST, 21:00 UTC = 02:30 IST.
    expect(greeting(new Date('2026-11-18T03:30:00Z'))).toBe('Good morning')
    expect(greeting(new Date('2026-11-18T08:30:00Z'))).toBe('Good afternoon')
    expect(greeting(new Date('2026-11-18T14:30:00Z'))).toBe('Good evening')
    expect(greeting(new Date('2026-11-18T21:00:00Z'))).toBe('Good evening')
  })
})

describe('names', () => {
  it('uses the first word of the name, and the email for the avatar without one', () => {
    expect(firstName('  Asha Rao ')).toBe('Asha')
    expect(firstName(null)).toBeNull()
    expect(firstName('   ')).toBeNull()
    expect(initial(null, 'zed@example.com')).toBe('Z')
    expect(initial('asha', 'zed@example.com')).toBe('A')
  })
})

describe('loggedTime', () => {
  it('shows the time only when it was logged on the day of the expense (India time)', () => {
    // 04:54 UTC = 10:24 IST on 28 Nov.
    expect(loggedTime('2026-11-28T04:54:00Z', '2026-11-28')).toMatch(/^10:24 am$/)
    // Logged on 28 Nov for a purchase on 27 Nov: the time would be misleading.
    expect(loggedTime('2026-11-28T04:54:00Z', '2026-11-27')).toBeNull()
    // 20:00 UTC on 27 Nov is already 28 Nov in India.
    expect(loggedTime('2026-11-27T20:00:00Z', '2026-11-28')).toMatch(/^1:30 am$/)
    expect(loggedTime(null, '2026-11-28')).toBeNull()
  })
})

describe('dayLabel', () => {
  it('names today and yesterday, adds the year for other years', () => {
    expect(dayLabel('2026-11-28', '2026-11-28')).toBe('Today, 28 Nov')
    expect(dayLabel('2026-11-27', '2026-11-28')).toBe('Yesterday, 27 Nov')
    expect(dayLabel('2026-11-24', '2026-11-28')).toBe('Tue, 24 Nov')
    expect(dayLabel('2025-12-31', '2026-01-02')).toBe('31 Dec 2025')
  })
})

function report(needsSpent: number, wantsSpent: number, elapsed: number): CycleReport {
  const line = (allocated: number, spent: number) => ({
    allocatedPaise: allocated,
    spentPaise: spent,
    remainingPaise: allocated - spent,
    overspent: spent > allocated,
  })
  return {
    days: { total: 30, elapsed, remaining: 30 - elapsed },
    needs: line(30_000, needsSpent),
    wants: line(18_000, wantsSpent),
  } as CycleReport
}

describe('paceStatus', () => {
  it('is on track at or under an even pace, ahead of pace above it, over plan when a budget is exceeded', () => {
    // Day 15 of 30: an even pace is 24,000 of 48,000.
    expect(paceStatus(report(12_000, 12_000, 15), true)).toEqual({ label: 'On track', tone: 'good' })
    expect(paceStatus(report(12_000, 13_000, 15), true)).toEqual({ label: 'On track', tone: 'good' })
    expect(paceStatus(report(14_000, 12_000, 15), true)).toEqual({ label: 'Ahead of pace', tone: 'warn' })
    expect(paceStatus(report(31_000, 0, 15), true)).toEqual({ label: 'Over plan', tone: 'bad' })
    expect(paceStatus(report(29_000, 17_000, 30), false)).toEqual({ label: 'Within plan', tone: 'good' })
  })
})

describe('percentOf', () => {
  it('rounds and handles a zero whole', () => {
    expect(percentOf(1, 3)).toBe(33)
    expect(percentOf(5, 0)).toBe(0)
  })
})

describe('donutSlices', () => {
  const cat = (id: string, spent: number, type: CategorySpend['type'] = 'NEED'): CategorySpend => ({
    categoryId: id,
    name: id,
    archived: false,
    type,
    spentPaise: spent,
    expenseCount: 1,
  })

  it('keeps the biggest four and groups the rest once there are more than five', () => {
    const slices = donutSlices([cat('a', 10), cat('b', 60), cat('c', 30), cat('d', 20), cat('e', 5), cat('f', 1)])
    expect(slices.map((s) => s.name)).toEqual(['b', 'c', 'd', 'a', '2 more'])
    expect(slices.at(-1)?.spentPaise).toBe(6)
  })

  it('shows five categories as they are, and merges Other logged as two types', () => {
    expect(donutSlices([cat('a', 1), cat('b', 2), cat('c', 3), cat('d', 4), cat('e', 5)])).toHaveLength(5)
    const merged = donutSlices([cat('other', 10, 'NEED'), cat('other', 15, 'WANT')])
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ spentPaise: 25, type: null })
  })

  it('leaves investments out, because they are savings', () => {
    expect(donutSlices([cat('sip', 500, 'INVESTMENT'), cat('food', 20, 'WANT')]).map((s) => s.name)).toEqual(['food'])
  })
})

describe('daysLeftLabel', () => {
  it('counts today', () => {
    expect(daysLeftLabel('2026-12-17', '2026-11-28')).toBe('20 days left')
    expect(daysLeftLabel('2026-11-28', '2026-11-28')).toBe('Last day')
    expect(daysLeftLabel('2026-11-27', '2026-11-28')).toBe('Ended')
  })
})
