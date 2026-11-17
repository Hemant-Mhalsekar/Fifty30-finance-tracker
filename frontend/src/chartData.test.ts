import { describe, expect, it } from 'vitest'
import { cycleDays, niceScale } from './chartData'

describe('cycleDays', () => {
  const daily = [
    { date: '2026-11-01', type: 'NEED' as const, spentPaise: 1_000 },
    { date: '2026-11-01', type: 'WANT' as const, spentPaise: 500 },
    { date: '2026-11-03', type: 'INVESTMENT' as const, spentPaise: 9_000 },
    { date: '2026-11-03', type: 'WANT' as const, spentPaise: 200 },
  ]

  it('fills empty days, keeps a running total of needs and wants, and stops at today', () => {
    const { days, totalDays } = cycleDays(daily, '2026-11-01', '2026-11-10', '2026-11-04', 10_000)
    expect(totalDays).toBe(10)
    expect(days.map((d) => d.date)).toEqual(['2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'])
    expect(days.map((d) => d.spentPaise)).toEqual([1_500, 0, 200, 0])
    expect(days.map((d) => d.runningPaise)).toEqual([1_500, 1_500, 1_700, 1_700])
    // Investments are savings: listed, but not part of spending.
    expect(days[2].investedPaise).toBe(9_000)
    // An even pace reaches the whole budget on the last day of the cycle.
    expect(days.map((d) => d.pacePaise)).toEqual([1_000, 2_000, 3_000, 4_000])
  })

  it('shows every day of a past cycle and none of a cycle that has not started', () => {
    expect(cycleDays(daily, '2026-11-01', '2026-11-03', '2026-12-25', 300).days).toHaveLength(3)
    expect(cycleDays(daily, '2026-11-01', '2026-11-03', '2026-10-31', 300).days).toHaveLength(0)
  })
})

describe('niceScale', () => {
  it.each([
    [23_400, 4, 30_000, 10_000],
    [1_000, 4, 1_000, 250],
    [9, 4, 10, 2.5],
    [2_600_000, 4, 3_000_000, 1_000_000],
  ])('%d over %d ticks -> max %d, step %d', (value, ticks, max, step) => {
    expect(niceScale(value, ticks)).toEqual({ max, step })
  })

  it('gives a usable scale for zero', () => {
    expect(niceScale(0)).toEqual({ max: 4, step: 1 })
  })
})
