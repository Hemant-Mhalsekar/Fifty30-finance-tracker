import type { BudgetType } from './api'
import { addDays } from './dates'

export type DailyRow = { date: string; type: BudgetType; spentPaise: number }

export type CycleDay = {
  date: string
  needsPaise: number
  wantsPaise: number
  investedPaise: number
  // Needs + wants on this day; investments are savings, so they are not "spending".
  spentPaise: number
  // Needs + wants from the first day of the cycle up to and including this day.
  runningPaise: number
  // Where an even pace through the needs + wants budget would be by the end of this day.
  pacePaise: number
}

/**
 * Every day of the cycle, oldest first, built from the report's sparse daily rows (days with
 * nothing logged have no row). Days after `today` are left out, so the line stops at today.
 */
export function cycleDays(
  daily: DailyRow[],
  start: string,
  end: string,
  today: string,
  budgetPaise: number,
): { days: CycleDay[]; totalDays: number } {
  const byDate = new Map<string, { NEED: number; WANT: number; INVESTMENT: number }>()
  for (const row of daily) {
    const day = byDate.get(row.date) ?? { NEED: 0, WANT: 0, INVESTMENT: 0 }
    day[row.type] += row.spentPaise
    byDate.set(row.date, day)
  }

  let totalDays = 0
  for (let d = start; d <= end; d = addDays(d, 1)) totalDays++

  const last = today < end ? today : end
  const days: CycleDay[] = []
  let running = 0
  let index = 0
  for (let d = start; d <= last; d = addDays(d, 1)) {
    const day = byDate.get(d) ?? { NEED: 0, WANT: 0, INVESTMENT: 0 }
    const spent = day.NEED + day.WANT
    running += spent
    index++
    days.push({
      date: d,
      needsPaise: day.NEED,
      wantsPaise: day.WANT,
      investedPaise: day.INVESTMENT,
      spentPaise: spent,
      runningPaise: running,
      // Whole rupees: a pace of ₹14,193.55 reads as false precision.
      pacePaise: Math.round((budgetPaise * index) / totalDays / 100) * 100,
    })
  }
  return { days, totalDays }
}

/**
 * A round axis maximum and step for about `ticks` gridlines: 1, 2, 2.5 or 5 times a power of ten.
 * 23_400 with 4 ticks -> step 10_000, max 30_000.
 */
export function niceScale(value: number, ticks = 4): { max: number; step: number } {
  if (!(value > 0)) return { max: ticks, step: 1 }
  const rough = value / ticks
  const power = 10 ** Math.floor(Math.log10(rough))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough)!
  return { max: Math.ceil(value / step) * step, step }
}
