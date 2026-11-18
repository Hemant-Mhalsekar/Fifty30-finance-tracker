import { describe, expect, it } from 'vitest'
import type { CycleHistoryItem } from './api'
import { savingsSummary, weekRows, yearRows } from './reports'

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
    const rows = yearRows([
      item('2025-12-25', '2026-01-24', { needs: 100, count: 1 }),
      item('2026-01-25', '2026-02-24', { wants: 50, invested: 10, count: 2 }),
      item('2026-02-25', '2026-03-24'),
    ])
    expect(rows.map((r) => [r.year, r.cycles])).toEqual([
      [2025, 1],
      [2026, 2],
    ])
    expect(rows[1]).toMatchObject({ incomePaise: 2_000_000, wantsPaise: 50, investedPaise: 10, savedPaise: 1_999_950 })
  })

  it('counts a bonus as income', () => {
    const bonusCycle = {
      ...item('2026-01-25', '2026-02-24'),
      cycle: cycle('2026-01-25', '2026-02-24', 1_000_000, 200_000),
    }
    expect(yearRows([bonusCycle])[0].incomePaise).toBe(1_200_000)
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
