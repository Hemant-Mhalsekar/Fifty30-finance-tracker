import { afterEach, describe, expect, it, vi } from 'vitest'
import { addDays, formatDate, formatRange, todayIst } from './dates'

describe('todayIst', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('is already tomorrow in India late in the UTC evening', () => {
    // 20:00 UTC is 01:30 the next day in Asia/Kolkata (UTC+5:30).
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T20:00:00Z'))
    expect(todayIst()).toBe('2026-11-11')
  })

  it('is still today just before midnight in India', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-10T18:29:00Z'))
    expect(todayIst()).toBe('2026-11-10')
  })
})

describe('addDays', () => {
  it.each([
    ['2026-01-31', 1, '2026-02-01'],
    ['2026-03-01', -1, '2026-02-28'],
    ['2028-03-01', -1, '2028-02-29'],
    ['2026-12-31', 1, '2027-01-01'],
    ['2026-11-10', 0, '2026-11-10'],
    ['2026-11-10', -365, '2025-11-10'],
  ])('%s %+d days is %s', (date, days, expected) => {
    expect(addDays(date, days)).toBe(expected)
  })
})

describe('formatDate', () => {
  it('shows day, short month and year', () => {
    expect(formatDate('2026-11-10')).toBe('10 Nov 2026')
    expect(formatDate('2028-02-29')).toBe('29 Feb 2028')
  })
})

describe('formatRange', () => {
  it('writes the year once within a year', () => {
    expect(formatRange('2026-10-30', '2026-11-29')).toBe('30 Oct – 29 Nov 2026')
  })

  it('writes both years when the range crosses a new year', () => {
    expect(formatRange('2026-12-25', '2027-01-24')).toBe('25 Dec 2026 – 24 Jan 2027')
  })
})
