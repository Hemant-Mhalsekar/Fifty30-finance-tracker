import { describe, expect, it } from 'vitest'
import type { BudgetType, CycleHistoryItem } from './api'
import {
  categoryInsights,
  categoryTrends,
  changePct,
  cycleInsights,
  cycleMonth,
  monthRows,
  savingsRate,
  savingsSummary,
  weekRows,
  yearRows,
} from './reports'

const cycle = (periodStart: string, periodEnd: string, salaryPaise = 1_000_000, bonusPaise = 0) => ({
  periodStart,
  periodEnd,
  salaryPaise,
  needsPaise: (salaryPaise + bonusPaise) / 2,
  wantsPaise: ((salaryPaise + bonusPaise) * 3) / 10,
  savingsPaise: (salaryPaise + bonusPaise) / 5,
  salaryConfirmed: true,
  bonusPaise,
  needsPct: 50,
  wantsPct: 30,
  savingsPct: 20,
})

const item = (
  periodStart: string,
  periodEnd: string,
  spent: { needs?: number; wants?: number; invested?: number; count?: number } = {},
): CycleHistoryItem => {
  const c = cycle(periodStart, periodEnd)
  const needs = spent.needs ?? 0
  const wants = spent.wants ?? 0
  return {
    cycle: c,
    needsSpentPaise: needs,
    wantsSpentPaise: wants,
    investedPaise: spent.invested ?? 0,
    savedPaise: c.salaryPaise - needs - wants,
    expenseCount: spent.count ?? 0,
  }
}

describe('weekRows', () => {
  it('splits into Monday weeks, sums by type and prorates the plan across two cycles', () => {
    // 30-day cycles of ₹10,000: ₹8,000 needs + wants plan, so about ₹266.67 a day.
    const rows = weekRows({
      from: '2026-11-02',
      to: '2026-11-11',
      cycles: [cycle('2026-10-06', '2026-11-04'), cycle('2026-11-05', '2026-12-04')],
      daily: [
        { date: '2026-11-02', type: 'NEED', spentPaise: 1_000 },
        { date: '2026-11-08', type: 'WANT', spentPaise: 500 },
        { date: '2026-11-09', type: 'WANT', spentPaise: 200 },
        { date: '2026-11-09', type: 'INVESTMENT', spentPaise: 5_000 },
      ],
    })
    expect(rows.map((r) => [r.start, r.end, r.current])).toEqual([
      ['2026-11-02', '2026-11-08', false],
      ['2026-11-09', '2026-11-15', true],
    ])
    expect(rows[0]).toMatchObject({ needsPaise: 1_000, wantsPaise: 500, investedPaise: 0 })
    expect(rows[1]).toMatchObject({ needsPaise: 0, wantsPaise: 200, investedPaise: 5_000 })
    // 7 days at 800000 / 30 a day, in whole rupees.
    expect(rows[0].planPaise).toBe(186_700)
    expect(rows[1].planPaise).toBe(186_700)
  })

  it('has no plan for days before the first cycle', () => {
    const rows = weekRows({
      from: '2026-11-02',
      to: '2026-11-08',
      cycles: [cycle('2026-11-05', '2026-12-04')],
      daily: [],
    })
    // Only 5 Nov to 8 Nov (4 days) are in a cycle.
    expect(rows[0].planPaise).toBe(106_700)
  })
})

describe('yearRows', () => {
  it('groups cycles by the year they start in', () => {
    const rows = yearRows(
      [
        item('2025-12-25', '2026-01-24', { needs: 100, count: 1 }),
        item('2026-01-25', '2026-02-24', { wants: 50, invested: 10, count: 2 }),
        item('2026-02-25', '2026-03-24'),
      ],
      '2026-06-01',
    )
    expect(rows.map((r) => [r.year, r.cycles])).toEqual([
      [2025, 1],
      [2026, 2],
    ])
    // The cycle with nothing logged is income, but not "saved".
    expect(rows[1]).toMatchObject({
      incomePaise: 2_000_000,
      wantsPaise: 50,
      investedPaise: 10,
      savedPaise: 999_950,
      savedCycles: 1,
    })
  })

  it('leaves the current cycle out of saved but keeps its spending', () => {
    const [row] = yearRows([item('2026-05-25', '2026-06-24', { needs: 300, count: 1 })], '2026-06-01')
    expect(row).toMatchObject({ needsPaise: 300, savedPaise: 0, savedCycles: 0 })
  })

  it('counts a bonus as income', () => {
    const bonusCycle = {
      ...item('2026-01-25', '2026-02-24'),
      cycle: cycle('2026-01-25', '2026-02-24', 1_000_000, 200_000),
    }
    expect(yearRows([bonusCycle], '2026-06-01')[0].incomePaise).toBe(1_200_000)
  })
})

describe('savingsSummary', () => {
  it('adds up finished cycles with expenses and keeps the current cycle apart', () => {
    const summary = savingsSummary(
      [
        item('2026-08-25', '2026-09-24', { needs: 500_000, wants: 300_000, invested: 100_000, count: 4 }),
        item('2026-09-25', '2026-10-24'),
        item('2026-10-25', '2026-11-24', { needs: 900_000, wants: 300_000, count: 2 }),
        item('2026-11-25', '2026-12-24', { needs: 10_000, count: 1 }),
      ],
      '2026-11-30',
    )
    expect(summary.rows.map((r) => [r.item.cycle.periodStart, r.runningPaise])).toEqual([
      ['2026-08-25', 200_000],
      // A deficit pulls the running total down.
      ['2026-10-25', 0],
    ])
    expect(summary.totalSavedPaise).toBe(0)
    expect(summary.totalInvestedPaise).toBe(100_000)
    expect(summary.skipped).toBe(1)
    expect(summary.current?.cycle.periodStart).toBe('2026-11-25')
    expect(summary.openingPaise).toBe(0)
    expect(summary.totalWithOpeningPaise).toBe(0)
  })

  it('starts the running total at the opening balance', () => {
    const summary = savingsSummary(
      [item('2026-08-25', '2026-09-24', { needs: 500_000, wants: 300_000, count: 1 })],
      '2026-11-30',
      5_000_000,
    )
    expect(summary.rows[0].runningPaise).toBe(5_200_000)
    // Saved in cycles stays separate from what the user started with.
    expect(summary.totalSavedPaise).toBe(200_000)
    expect(summary.totalWithOpeningPaise).toBe(5_200_000)
  })
})

describe('monthRows', () => {
  it('names a cycle after the month most of it falls in', () => {
    expect(cycleMonth('2026-10-30', '2026-11-29')).toBe(cycleMonth('2026-11-01', '2026-11-30'))
    expect(cycleMonth('2026-11-01', '2026-11-30')).toMatch(/Nov.*2026/)
    expect(cycleMonth('2026-12-25', '2027-01-24')).toMatch(/Jan.*2027/)
    expect(cycleMonth('2026-03-31', '2026-03-31')).toMatch(/Mar.*2026/)
  })

  it('keeps the latest cycles, marks the current one and counts only finished cycles with expenses', () => {
    const items = [
      item('2026-01-25', '2026-02-24', { needs: 100, count: 1 }),
      item('2026-02-25', '2026-03-24'),
      item('2026-03-25', '2026-04-24', { needs: 200, wants: 50, count: 3 }),
      item('2026-04-25', '2026-05-24', { wants: 10, count: 1 }),
    ]
    const rows = monthRows(items, '2026-05-01', 3)
    expect(rows.map((r) => r.item.cycle.periodStart)).toEqual(['2026-02-25', '2026-03-25', '2026-04-25'])
    expect(rows.map((r) => [r.current, r.counted])).toEqual([
      [false, false],
      [false, true],
      [true, false],
    ])
    expect(rows[1]).toMatchObject({ incomePaise: 1_000_000, planPaise: 800_000, spentPaise: 250 })
  })
})

describe('savingsRate and changePct', () => {
  it('rounds to whole percentages and refuses to divide by zero', () => {
    expect(savingsRate(245_000, 1_000_000)).toBe(25)
    expect(savingsRate(-100_000, 1_000_000)).toBe(-10)
    expect(savingsRate(100, 0)).toBeNull()
    expect(changePct(135, 100)).toBe(35)
    expect(changePct(50, 0)).toBeNull()
  })
})

describe('cycleInsights', () => {
  const finished = (start: string, end: string, needs: number, wants: number) =>
    item(start, end, { needs, wants, count: 1 })

  it('compares the last savings rate with the cycles before it and counts cycles over plan', () => {
    const items = [
      finished('2026-01-25', '2026-02-24', 400_000, 400_000), // saved 20%, wants over (plan 300,000)
      finished('2026-02-25', '2026-03-24', 400_000, 350_000), // 25%, wants over
      finished('2026-03-25', '2026-04-24', 300_000, 200_000), // 50%
      item('2026-04-25', '2026-05-24', { wants: 999_999, count: 1 }), // current: never counted
    ]
    expect(cycleInsights(items, '2026-05-01')).toEqual([
      expect.stringMatching(/^You saved 50% of your income in Apr.*2026, your best in the last 3 cycles\.$/),
      'Wants went over plan in 2 of the last 3 cycles.',
    ])
  })

  it('reports an average when the last cycle was not the best, and a deficit plainly', () => {
    const items = [
      finished('2026-01-25', '2026-02-24', 100_000, 100_000), // 80%
      finished('2026-02-25', '2026-03-24', 400_000, 200_000), // 40%
      finished('2026-03-25', '2026-04-24', 400_000, 200_000), // 40%
    ]
    expect(cycleInsights(items, '2026-05-01')[0]).toMatch(/40% .* average over the last 3 cycles is 53%\.$/)
    expect(cycleInsights(items, '2026-05-01')[1]).toBe(
      'Needs and wants stayed within plan in each of the last 3 cycles.',
    )
    expect(cycleInsights([finished('2026-03-25', '2026-04-24', 900_000, 200_000)], '2026-05-01')[0]).toMatch(
      /ended with a deficit of 10% of your income\.$/,
    )
  })

  it('says nothing without a finished cycle that has expenses', () => {
    expect(cycleInsights([item('2026-04-25', '2026-05-24', { needs: 5, count: 1 })], '2026-05-01')).toEqual([])
  })
})

describe('categoryTrends and categoryInsights', () => {
  const cycles = [
    cycle('2026-02-25', '2026-03-24'),
    cycle('2026-03-25', '2026-04-24'),
    cycle('2026-04-25', '2026-05-24'),
  ]
  const row = (periodStart: string, categoryId: string, name: string, type: BudgetType, spentPaise: number) => ({
    periodStart,
    categoryId,
    name,
    archived: false,
    type,
    spentPaise,
    expenseCount: 1,
  })
  const data = {
    cycles,
    rows: [
      row('2026-02-25', 'rent', 'Rent', 'NEED', 1_500_000),
      row('2026-02-25', 'dining', 'Dining', 'WANT', 200_000),
      row('2026-02-25', 'shop', 'Shopping', 'WANT', 300_000),
      row('2026-03-25', 'rent', 'Rent', 'NEED', 1_500_000),
      row('2026-03-25', 'dining', 'Dining', 'WANT', 300_000),
      row('2026-03-25', 'shop', 'Shopping', 'WANT', 100_000),
      row('2026-03-25', 'other', 'Other', 'WANT', 20_000),
      row('2026-03-25', 'other', 'Other', 'NEED', 10_000),
      row('2026-03-25', 'inv', 'Investments', 'INVESTMENT', 500_000),
      row('2026-04-25', 'dining', 'Dining', 'WANT', 40_000),
    ],
  }

  it('lines up each category per cycle, splits Other by type and leaves investments out', () => {
    const s = categoryTrends(data, '2026-05-01')
    expect([s.beforeIndex, s.lastIndex, s.currentIndex]).toEqual([0, 1, 2])
    expect(s.categories.map((c) => c.name)).toEqual(['Rent', 'Dining', 'Shopping', 'Other (wants)', 'Other (needs)'])
    expect(s.categories[1].perCycle).toEqual([200_000, 300_000, 40_000])
  })

  it('names the biggest spend and the biggest rise and fall between the last two finished cycles', () => {
    const lines = categoryInsights(categoryTrends(data, '2026-05-01'))
    expect(lines).toHaveLength(3)
    expect(lines[0]).toMatch(/^Rent was your biggest spend in Apr.*2026: ₹15,000, 78% of needs and wants\.$/)
    expect(lines[1]).toMatch(/^Dining went up 50% in Apr.*\(₹1,000 more than Mar.*\)\.$/)
    expect(lines[2]).toMatch(/^Shopping went down 67% in Apr.*\(₹2,000 less than Mar.*\)\.$/)
  })

  it('has nothing to say before a cycle has finished', () => {
    expect(categoryInsights(categoryTrends({ cycles: [cycles[2]], rows: [] }, '2026-05-01'))).toEqual([])
  })
})
