import { incomeOf } from './splits'
import type { CycleHistoryItem, WeeklyData } from './api'
import { addDays } from './dates'

export type WeekRow = {
  start: string
  end: string
  // The week that contains today; its plan is still the whole week's.
  current: boolean
  needsPaise: number
  wantsPaise: number
  investedPaise: number
  // Needs + wants plan for the 7 days, prorated per day from the cycle each day belongs to.
  // Days before the first cycle have no plan. Whole rupees.
  planPaise: number
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1
}

/** Splits the weekly data into Monday-to-Sunday weeks, oldest first. */
export function weekRows(data: WeeklyData): WeekRow[] {
  const rows: WeekRow[] = []
  for (let start = data.from; start <= data.to; start = addDays(start, 7)) {
    const end = addDays(start, 6)
    let plan = 0
    for (let d = start; d <= end; d = addDays(d, 1)) {
      const cycle = data.cycles.find((c) => c.periodStart <= d && d <= c.periodEnd)
      if (cycle) plan += (cycle.needsPaise + cycle.wantsPaise) / daysBetween(cycle.periodStart, cycle.periodEnd)
    }
    const sum = (type: string) =>
      data.daily
        .filter((r) => r.type === type && r.date >= start && r.date <= end)
        .reduce((total, r) => total + r.spentPaise, 0)
    rows.push({
      start,
      end,
      current: start <= data.to && data.to <= end,
      needsPaise: sum('NEED'),
      wantsPaise: sum('WANT'),
      investedPaise: sum('INVESTMENT'),
      planPaise: Math.round(plan / 100) * 100,
    })
  }
  return rows
}

export type YearRow = {
  year: number
  cycles: number
  // Salary + bonus.
  incomePaise: number
  needsPaise: number
  wantsPaise: number
  investedPaise: number
  savedPaise: number
}

/** Cycles grouped by the calendar year they start in, oldest first. */
export function yearRows(items: CycleHistoryItem[]): YearRow[] {
  const years = new Map<number, YearRow>()
  for (const item of items) {
    const year = Number(item.cycle.periodStart.slice(0, 4))
    const row = years.get(year) ?? {
      year,
      cycles: 0,
      incomePaise: 0,
      needsPaise: 0,
      wantsPaise: 0,
      investedPaise: 0,
      savedPaise: 0,
    }
    row.cycles += 1
    row.incomePaise += incomeOf(item.cycle)
    row.needsPaise += item.needsSpentPaise
    row.wantsPaise += item.wantsSpentPaise
    row.investedPaise += item.investedPaise
    row.savedPaise += item.savedPaise
    years.set(year, row)
  }
  return [...years.values()].sort((a, b) => a.year - b.year)
}

export type SavingsRow = { item: CycleHistoryItem; runningPaise: number }

export type SavingsSummary = {
  // Finished cycles with at least one expense, oldest first, with a running total of saved.
  rows: SavingsRow[]
  // Saved in finished cycles, without the opening balance.
  totalSavedPaise: number
  // What the user had before (0 if none given) and the running total including it.
  openingPaise: number
  totalWithOpeningPaise: number
  totalInvestedPaise: number
  // Finished cycles with nothing logged: they would count as saving the whole salary.
  skipped: number
  // The cycle containing today, shown separately because it is not finished.
  current: CycleHistoryItem | null
}

/**
 * Savings over time: the sum of what was left over in finished cycles that have at least one
 * expense. The current cycle is separate, since its "saved" shrinks as the cycle goes on.
 */
export function savingsSummary(items: CycleHistoryItem[], today: string, openingPaise = 0): SavingsSummary {
  const rows: SavingsRow[] = []
  let saved = 0
  let invested = 0
  let skipped = 0
  let current: CycleHistoryItem | null = null
  for (const item of items) {
    if (item.cycle.periodStart <= today && today <= item.cycle.periodEnd) {
      current = item
      continue
    }
    if (item.cycle.periodEnd >= today) continue
    if (item.expenseCount === 0) {
      skipped++
      continue
    }
    saved += item.savedPaise
    invested += item.investedPaise
    rows.push({ item, runningPaise: openingPaise + saved })
  }
  return {
    rows,
    totalSavedPaise: saved,
    openingPaise,
    totalWithOpeningPaise: openingPaise + saved,
    totalInvestedPaise: invested,
    skipped,
    current,
  }
}
