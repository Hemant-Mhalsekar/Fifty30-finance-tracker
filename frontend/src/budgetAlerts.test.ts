import { describe, expect, it } from 'vitest'
import type { CycleReport } from './api'
import { alertLevel, alertText, budgetAlerts, crossedLevel, crossedText } from './budgetAlerts'

function report(needsSpent: number, wantsSpent: number): CycleReport {
  const line = (allocated: number, spent: number) => ({
    allocatedPaise: allocated,
    spentPaise: spent,
    remainingPaise: allocated - spent,
    overspent: spent > allocated,
  })
  return {
    needs: line(25_000_00, needsSpent),
    wants: line(15_000_00, wantsSpent),
  } as unknown as CycleReport
}

describe('alertLevel', () => {
  it('warns from exactly 80% and marks the plan used up from exactly 100%', () => {
    expect(alertLevel(7_999, 10_000)).toBeNull()
    expect(alertLevel(8_000, 10_000)).toBe('near')
    expect(alertLevel(9_999, 10_000)).toBe('near')
    expect(alertLevel(10_000, 10_000)).toBe('reached')
    expect(alertLevel(12_000, 10_000)).toBe('reached')
    expect(alertLevel(0, 0)).toBeNull()
    expect(alertLevel(1, 0)).toBe('reached')
  })
})

describe('budgetAlerts', () => {
  it('lists needs before wants, only the ones at 80% or more', () => {
    expect(budgetAlerts(report(10_000_00, 5_000_00))).toEqual([])
    const alerts = budgetAlerts(report(21_000_00, 16_500_00))
    expect(alerts.map((a) => [a.type, a.level, a.percent, a.over])).toEqual([
      ['NEED', 'near', 84, false],
      ['WANT', 'reached', 110, true],
    ])
    expect(alertText(alerts[0], 9)).toBe('Needs: 84% of the plan used, ₹4,000.00 left for 9 days.')
    expect(alertText(alerts[1], 1)).toBe('Wants are ₹1,500.00 over plan. The extra comes out of savings.')
    const [usedUp] = budgetAlerts(report(25_000_00, 0))
    expect(alertText(usedUp, 1)).toBe('Needs: the whole plan is used, with 1 day to go.')
  })
})

describe('crossedLevel', () => {
  it('reports only the line this expense crossed', () => {
    expect(crossedLevel(7_000, 500, 10_000)).toBeNull() // still under 80%
    expect(crossedLevel(8_200, 500, 10_000)).toBe('near') // 77% -> 82%
    expect(crossedLevel(8_700, 500, 10_000)).toBeNull() // already past 80%
    expect(crossedLevel(10_100, 500, 10_000)).toBe('reached') // 96% -> 101%
    expect(crossedLevel(10_500, 6_000, 10_000)).toBe('reached') // 45% straight past both
    expect(crossedLevel(12_000, 500, 10_000)).toBeNull() // already over
    expect(crossedText('WANT', 'near', 8_200_00, 10_000_00)).toBe(
      'Heads up: wants are at 82% of the plan, ₹1,800.00 left.',
    )
    expect(crossedText('NEED', 'reached', 10_000_00, 10_000_00)).toBe(
      'Heads up: that uses up the needs plan for this cycle.',
    )
    expect(crossedText('NEED', 'reached', 10_100_00, 10_000_00)).toBe('Heads up: needs are now ₹100.00 over plan.')
  })
})
