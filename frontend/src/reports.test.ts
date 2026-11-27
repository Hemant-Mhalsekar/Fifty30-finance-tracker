import { describe, expect, it } from 'vitest'
import type { BudgetType, CycleHistoryItem, CycleReport } from './api'
import {
  categoryExpensesLink,
  categoryInsights,
  categoryShares,
  samePointLastCycle,
  categoryTrends,
  changePct,
  cycleInsights,
  cycleMonth,
  monthRows,
  savingsRate,
  savingsSummary,
  weekRows,
  yearReview,
  yearReviewLines,
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

describe('this cycle against the last one', () => {
  const report = (
    periodStart: string,
    periodEnd: string,
    elapsed: number,
    daily: CycleReport['daily'],
    categories: CycleReport['categories'] = [],
  ): CycleReport =>
    ({
      cycle: cycle(periodStart, periodEnd),
      days: { total: 31, elapsed, remaining: 31 - elapsed },
      daily,
      categories,
    }) as unknown as CycleReport
  const day = (date: string, type: BudgetType, spentPaise: number) => ({ date, type, spentPaise })

  it('compares spending so far with the previous cycle by the same day', () => {
    const previous = report('2026-10-25', '2026-11-24', 31, [
      day('2026-10-25', 'NEED', 1_500_000),
      day('2026-10-28', 'WANT', 100_000),
      day('2026-10-29', 'WANT', 900_000), // day 5: after the same point, left out
      day('2026-10-26', 'INVESTMENT', 500_000), // savings, never spending
    ])
    const current = report('2026-11-25', '2026-12-24', 4, [
      day('2026-11-25', 'NEED', 1_500_000),
      day('2026-11-27', 'WANT', 300_000),
    ])
    expect(samePointLastCycle(current, previous, 'BOTH')).toEqual({
      day: 4,
      nowPaise: 1_800_000,
      thenPaise: 1_600_000,
      pct: 13,
    })
    expect(samePointLastCycle(current, previous, 'WANT')!.pct).toBe(200)
    expect(samePointLastCycle(current, null, 'BOTH')).toBeNull()
  })

  it('compares a long cycle with all of a shorter previous one', () => {
    const previous = report('2026-02-01', '2026-02-28', 28, [day('2026-02-28', 'WANT', 100)])
    const current = report('2026-03-01', '2026-03-31', 31, [day('2026-03-31', 'WANT', 150)])
    expect(samePointLastCycle(current, previous, 'BOTH')).toMatchObject({ thenPaise: 100, pct: 50 })
  })

  it('lists needs and wants categories with their share and last cycle, and links to their expenses', () => {
    const spend = (categoryId: string, name: string, type: BudgetType, spentPaise: number) => ({
      categoryId,
      name,
      archived: false,
      type,
      spentPaise,
      expenseCount: 1,
    })
    const previous = report('2026-10-25', '2026-11-24', 31, [], [spend('rent', 'Rent', 'NEED', 1_500_000)])
    const current = report(
      '2026-11-25',
      '2026-12-24',
      4,
      [],
      [
        spend('rent', 'Rent', 'NEED', 1_500_000),
        spend('other', 'Other', 'WANT', 300_000),
        spend('inv', 'Investments', 'INVESTMENT', 900_000),
        spend('other', 'Other', 'NEED', 200_000),
      ],
    )
    const shares = categoryShares(current, previous)
    expect(shares.map((s) => [s.name, s.sharePct, s.lastCyclePaise])).toEqual([
      ['Rent', 75, 1_500_000],
      ['Other (wants)', 15, 0],
      ['Other (needs)', 10, 0],
    ])
    expect(categoryShares(current, null)[0].lastCyclePaise).toBeNull()
    expect(categoryExpensesLink(shares[0], '2026-11-25', '2026-11-28')).toBe(
      '/expenses?categoryId=rent&from=2026-11-25&to=2026-11-28',
    )
    expect(categoryExpensesLink(shares[1], '2026-11-25', '2026-11-28')).toBe(
      '/expenses?categoryId=other&from=2026-11-25&to=2026-11-28&type=WANT',
    )
  })
})

describe('yearReview', () => {
  // Salary ₹10,000: needs plan ₹5,000, wants plan ₹3,000.
  const items = [
    item('2025-12-25', '2026-01-24', { needs: 100_000, count: 1 }),
    item('2026-01-25', '2026-02-24', { needs: 400_000, wants: 100_000, count: 3 }), // saved 50%
    item('2026-02-25', '2026-03-24', { needs: 550_000, wants: 350_000, count: 4 }), // saved 10%, both over plan
    item('2026-03-25', '2026-04-24', { needs: 200_000, wants: 100_000, invested: 50_000, count: 2 }), // 70%
    item('2026-04-25', '2026-05-24', { needs: 10_000, count: 1 }), // current: not saved yet
  ]
  const rows = [
    {
      periodStart: '2026-01-25',
      categoryId: 'rent',
      name: 'Rent',
      archived: false,
      type: 'NEED' as BudgetType,
      spentPaise: 300_000,
      expenseCount: 1,
    },
    {
      periodStart: '2026-02-25',
      categoryId: 'rent',
      name: 'Rent',
      archived: false,
      type: 'NEED' as BudgetType,
      spentPaise: 300_000,
      expenseCount: 1,
    },
    {
      periodStart: '2026-02-25',
      categoryId: 'other',
      name: 'Other',
      archived: false,
      type: 'WANT' as BudgetType,
      spentPaise: 50_000,
      expenseCount: 1,
    },
    {
      periodStart: '2026-03-25',
      categoryId: 'other',
      name: 'Other',
      archived: false,
      type: 'NEED' as BudgetType,
      spentPaise: 20_000,
      expenseCount: 1,
    },
    {
      periodStart: '2026-03-25',
      categoryId: 'sip',
      name: 'Investments',
      archived: false,
      type: 'INVESTMENT' as BudgetType,
      spentPaise: 50_000,
      expenseCount: 1,
    },
  ]

  it('sums the cycles that start in the year and picks the best, toughest and biggest', () => {
    const review = yearReview(items, rows, 2026, '2026-05-01')!
    expect(review).toMatchObject({
      year: 2026,
      from: '2026-01-25',
      to: '2026-05-24',
      cycles: 4,
      complete: false,
      incomePaise: 4_000_000,
      investedPaise: 50_000,
      savedPaise: 1_300_000,
      savedCycles: 3,
      savingsRatePct: 43,
      needsOverCycles: 1,
      wantsOverCycles: 1,
      best: { month: 'Apr 2026', ratePct: 70 },
      worst: { month: 'Mar 2026', ratePct: 10 },
      biggest: { month: 'Mar 2026', spentPaise: 900_000 },
      categoriesTotalPaise: 670_000,
    })
    // Investments left out; Other split by the type it was logged with.
    expect(review.categories.map((c) => [c.name, c.spentPaise, c.splitByType])).toEqual([
      ['Rent', 600_000, false],
      ['Other (wants)', 50_000, true],
      ['Other (needs)', 20_000, true],
    ])
    expect(yearReview(items, [], 2024, '2026-05-01')).toBeNull()
  })

  it('says it in plain sentences', () => {
    const review = yearReview(items, rows, 2026, '2026-05-01')!
    expect(yearReviewLines(review)).toEqual([
      'You saved ₹13,000 in 2026 so far, 43% of your income over 3 finished cycles.',
      'Best cycle: Apr 2026 (70% saved). Toughest: Mar 2026 (10%).',
      'Rent took the most: ₹6,000, 90% of needs and wants.',
      'Over plan: needs in 1 cycle and wants in 1 cycle of 4.',
    ])
    const calm = yearReview([items[0]], [], 2025, '2026-05-01')!
    expect(yearReviewLines(calm)).toEqual([
      'You saved ₹9,000 in 2025, 90% of your income over 1 finished cycle.',
      'Needs and wants stayed within plan in every cycle in 2025.',
    ])
  })
})
