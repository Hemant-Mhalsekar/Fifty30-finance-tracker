import { incomeOf } from './splits'
import type { BudgetType, CategoryTrends, Cycle, CycleHistoryItem, CycleReport, WeeklyData } from './api'
import { formatPaiseShort } from './money'
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
  // Only from finished cycles with at least one expense, the same rule as the savings report:
  // the current cycle and empty cycles would count unspent (or unlogged) salary as saved.
  savedPaise: number
  savedCycles: number
}

// Finished, and something was logged: the only cycles whose "saved" means anything.
function countsAsSaved(item: CycleHistoryItem, today: string): boolean {
  return item.cycle.periodEnd < today && item.expenseCount > 0
}

/** Cycles grouped by the calendar year they start in, oldest first. */
export function yearRows(items: CycleHistoryItem[], today: string): YearRow[] {
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
      savedCycles: 0,
    }
    row.cycles += 1
    row.incomePaise += incomeOf(item.cycle)
    row.needsPaise += item.needsSpentPaise
    row.wantsPaise += item.wantsSpentPaise
    row.investedPaise += item.investedPaise
    if (countsAsSaved(item, today)) {
      row.savedPaise += item.savedPaise
      row.savedCycles += 1
    }
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
    if (!countsAsSaved(item, today)) {
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

export type MonthRow = {
  item: CycleHistoryItem
  // The month most of the cycle falls in, e.g. "Nov 2026" for 30 Oct to 29 Nov.
  month: string
  current: boolean
  // Finished with at least one expense; only then is "saved" a real figure.
  counted: boolean
  incomePaise: number
  // Needs + wants: what the cycle planned to spend and what it did.
  planPaise: number
  spentPaise: number
}

const MONTH_YEAR = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'short', year: 'numeric' })

/** The month a cycle is named after: the one its middle day falls in. */
export function cycleMonth(periodStart: string, periodEnd: string): string {
  const middle = addDays(periodStart, Math.floor((daysBetween(periodStart, periodEnd) - 1) / 2))
  return MONTH_YEAR.format(new Date(`${middle}T00:00:00Z`))
}

/** One row per pay cycle, the latest `limit` cycles up to today, oldest first. */
export function monthRows(items: CycleHistoryItem[], today: string, limit = 12): MonthRow[] {
  return items
    .filter((item) => item.cycle.periodStart <= today)
    .slice(-limit)
    .map((item) => ({
      item,
      month: cycleMonth(item.cycle.periodStart, item.cycle.periodEnd),
      current: item.cycle.periodStart <= today && today <= item.cycle.periodEnd,
      counted: countsAsSaved(item, today),
      incomePaise: incomeOf(item.cycle),
      planPaise: item.cycle.needsPaise + item.cycle.wantsPaise,
      spentPaise: item.needsSpentPaise + item.wantsSpentPaise,
    }))
}

/** Saved as a whole percentage of income; null without income. */
export function savingsRate(savedPaise: number, incomePaise: number): number | null {
  return incomePaise > 0 ? Math.round((savedPaise * 100) / incomePaise) : null
}

/** Change from `before` to `after` as a whole percentage; null when there is nothing to compare with. */
export function changePct(after: number, before: number): number | null {
  return before > 0 ? Math.round(((after - before) * 100) / before) : null
}

/**
 * Up to three plain sentences about recent pay cycles: the savings rate of the last finished
 * cycle against the ones before it, and how often needs or wants went over plan.
 * Only finished cycles with expenses count, as everywhere else.
 */
export function cycleInsights(items: CycleHistoryItem[], today: string): string[] {
  const counted = items.filter((item) => countsAsSaved(item, today))
  const out: string[] = []
  const last = counted.at(-1)
  if (last) {
    const month = cycleMonth(last.cycle.periodStart, last.cycle.periodEnd)
    const rate = savingsRate(last.savedPaise, incomeOf(last.cycle))
    const recent = counted.slice(-6)
    const rates = recent.map((i) => savingsRate(i.savedPaise, incomeOf(i.cycle)) ?? 0)
    if (rate !== null && rate < 0) {
      out.push(`${month} ended with a deficit of ${-rate}% of your income.`)
    } else if (rate !== null && recent.length >= 3) {
      const best = Math.max(...rates.slice(0, -1))
      const average = Math.round(rates.reduce((t, r) => t + r, 0) / rates.length)
      out.push(
        rate > best
          ? `You saved ${rate}% of your income in ${month}, your best in the last ${recent.length} cycles.`
          : `You saved ${rate}% of your income in ${month}; your average over the last ${recent.length} cycles is ${average}%.`,
      )
    } else if (rate !== null) {
      out.push(`You saved ${rate}% of your income in ${month}.`)
    }
  }

  const lastFew = counted.slice(-4)
  if (lastFew.length >= 2) {
    const wantsOver = lastFew.filter((i) => i.wantsSpentPaise > i.cycle.wantsPaise).length
    const needsOver = lastFew.filter((i) => i.needsSpentPaise > i.cycle.needsPaise).length
    if (wantsOver >= 2) out.push(`Wants went over plan in ${wantsOver} of the last ${lastFew.length} cycles.`)
    if (needsOver >= 2) out.push(`Needs went over plan in ${needsOver} of the last ${lastFew.length} cycles.`)
    if (wantsOver === 0 && needsOver === 0) {
      out.push(`Needs and wants stayed within plan in each of the last ${lastFew.length} cycles.`)
    }
  }
  return out.slice(0, 3)
}

export type CategoryTrend = {
  key: string
  categoryId: string
  // Shown as two lines (needs and wants); a link to its expenses must name the type.
  splitByType: boolean
  name: string
  type: BudgetType
  archived: boolean
  // Spent in each cycle, in the order of the summary's cycles.
  perCycle: number[]
  totalPaise: number
}

export type CategoryTrendSummary = {
  cycles: Cycle[]
  // Positions in `cycles`; -1 when there is no such cycle.
  currentIndex: number
  // The last finished cycle and the one before it.
  lastIndex: number
  beforeIndex: number
  // Needs and wants categories, biggest total first. Investments are savings, so they are left out.
  categories: CategoryTrend[]
}

/** Spending per category across recent cycles, ready for the chart and the table. */
export function categoryTrends(data: CategoryTrends, today: string): CategoryTrendSummary {
  const position = new Map(data.cycles.map((c, i) => [c.periodStart, i]))
  const spending = data.rows.filter((r) => r.type !== 'INVESTMENT' && position.has(r.periodStart))
  // "Other" is logged as a need or a want; when both show up they become two lines.
  const types = new Map<string, Set<BudgetType>>()
  for (const r of spending) types.set(r.categoryId, (types.get(r.categoryId) ?? new Set()).add(r.type))

  const byKey = new Map<string, CategoryTrend>()
  for (const r of spending) {
    const key = `${r.categoryId}:${r.type}`
    const split = types.get(r.categoryId)!.size > 1
    const trend = byKey.get(key) ?? {
      key,
      categoryId: r.categoryId,
      splitByType: split,
      name: split ? `${r.name} (${r.type === 'NEED' ? 'needs' : 'wants'})` : r.name,
      type: r.type,
      archived: r.archived,
      perCycle: data.cycles.map(() => 0),
      totalPaise: 0,
    }
    trend.perCycle[position.get(r.periodStart)!] += r.spentPaise
    trend.totalPaise += r.spentPaise
    byKey.set(key, trend)
  }

  const finished = data.cycles.flatMap((c, i) => (c.periodEnd < today ? [i] : []))
  return {
    cycles: data.cycles,
    currentIndex: data.cycles.findIndex((c) => c.periodStart <= today && today <= c.periodEnd),
    lastIndex: finished.at(-1) ?? -1,
    beforeIndex: finished.at(-2) ?? -1,
    categories: [...byKey.values()].sort((a, b) => b.totalPaise - a.totalPaise || a.name.localeCompare(b.name)),
  }
}

// Changes smaller than this, or from a base smaller than ₹500, are noise rather than news.
const MIN_CHANGE_PCT = 20
const MIN_BASE_PAISE = 50_000

/** Up to three sentences: the biggest category last cycle, and what grew or shrank the most. */
export function categoryInsights(summary: CategoryTrendSummary): string[] {
  const { cycles, lastIndex, beforeIndex, categories } = summary
  if (lastIndex < 0) return []
  const out: string[] = []
  const monthOf = (i: number) => cycleMonth(cycles[i].periodStart, cycles[i].periodEnd)
  const lastTotal = categories.reduce((t, c) => t + c.perCycle[lastIndex], 0)
  const top = [...categories].sort((a, b) => b.perCycle[lastIndex] - a.perCycle[lastIndex])[0]
  if (top && lastTotal > 0 && top.perCycle[lastIndex] > 0) {
    const share = Math.round((top.perCycle[lastIndex] * 100) / lastTotal)
    out.push(
      `${top.name} was your biggest spend in ${monthOf(lastIndex)}: ${formatPaiseShort(top.perCycle[lastIndex])}, ${share}% of needs and wants.`,
    )
  }
  if (beforeIndex >= 0) {
    const changes = categories
      .filter((c) => c.perCycle[beforeIndex] >= MIN_BASE_PAISE)
      .map((c) => ({ c, pct: changePct(c.perCycle[lastIndex], c.perCycle[beforeIndex])! }))
    const up = changes.filter((x) => x.pct >= MIN_CHANGE_PCT).sort((a, b) => b.pct - a.pct)[0]
    const down = changes.filter((x) => x.pct <= -MIN_CHANGE_PCT).sort((a, b) => a.pct - b.pct)[0]
    const diff = (x: { c: CategoryTrend }) =>
      formatPaiseShort(Math.abs(x.c.perCycle[lastIndex] - x.c.perCycle[beforeIndex]))
    if (up) {
      out.push(
        `${up.c.name} went up ${up.pct}% in ${monthOf(lastIndex)} (${diff(up)} more than ${monthOf(beforeIndex)}).`,
      )
    }
    if (down) {
      out.push(
        `${down.c.name} went down ${-down.pct}% in ${monthOf(lastIndex)} (${diff(down)} less than ${monthOf(beforeIndex)}).`,
      )
    }
  }
  return out.slice(0, 3)
}

export type PaceComparison = {
  // Day of the cycle (1 = the pay day) both cycles are measured at.
  day: number
  nowPaise: number
  thenPaise: number
  // null when the previous cycle had spent nothing by then.
  pct: number | null
}

type Spending = 'NEED' | 'WANT' | 'BOTH'

function spentThrough(daily: CycleReport['daily'], through: string, which: Spending): number {
  return daily
    .filter((r) => r.date <= through && (which === 'BOTH' ? r.type !== 'INVESTMENT' : r.type === which))
    .reduce((t, r) => t + r.spentPaise, 0)
}

/**
 * This cycle's spending so far against the previous cycle's by the same day of the cycle, which
 * is fair early in a cycle (comparing with the whole previous cycle would always look cheap).
 * Day 31 of a 30-day previous cycle compares with all of it.
 */
export function samePointLastCycle(
  current: CycleReport,
  previous: CycleReport | null,
  which: Spending,
): PaceComparison | null {
  if (!previous) return null
  const day = current.days.elapsed
  const sameDay = addDays(previous.cycle.periodStart, day - 1)
  const through = sameDay < previous.cycle.periodEnd ? sameDay : previous.cycle.periodEnd
  const nowPaise = spentThrough(current.daily, current.cycle.periodEnd, which)
  const thenPaise = spentThrough(previous.daily, through, which)
  return { day, nowPaise, thenPaise, pct: changePct(nowPaise, thenPaise) }
}

export type CategoryShare = {
  key: string
  categoryId: string
  name: string
  type: BudgetType
  // True when the category shows up as both a need and a want (only "Other" can), so a link
  // to its expenses must name the type too.
  splitByType: boolean
  spentPaise: number
  // Of this cycle's needs + wants, whole percent.
  sharePct: number
  // The whole previous cycle; null when there is none.
  lastCyclePaise: number | null
}

/** Needs and wants categories of a cycle, biggest first, with their share and last cycle's amount. */
export function categoryShares(current: CycleReport, previous: CycleReport | null): CategoryShare[] {
  const rows = current.categories.filter((c) => c.type !== 'INVESTMENT' && c.spentPaise > 0)
  const total = rows.reduce((t, c) => t + c.spentPaise, 0)
  const types = new Map<string, Set<BudgetType>>()
  for (const c of rows) types.set(c.categoryId, (types.get(c.categoryId) ?? new Set()).add(c.type))
  return rows
    .map((c) => {
      const split = types.get(c.categoryId)!.size > 1
      const before = previous?.categories.find((p) => p.categoryId === c.categoryId && p.type === c.type)
      return {
        key: `${c.categoryId}:${c.type}`,
        categoryId: c.categoryId,
        name: split ? `${c.name} (${c.type === 'NEED' ? 'needs' : 'wants'})` : c.name,
        type: c.type,
        splitByType: split,
        spentPaise: c.spentPaise,
        sharePct: total > 0 ? Math.round((c.spentPaise * 100) / total) : 0,
        lastCyclePaise: previous ? (before?.spentPaise ?? 0) : null,
      }
    })
    .sort((a, b) => b.spentPaise - a.spentPaise || a.name.localeCompare(b.name))
}

/** The Expenses page filtered to one category within a date range. */
export function categoryExpensesLink(
  share: Pick<CategoryShare, 'categoryId' | 'type' | 'splitByType'>,
  from: string,
  to: string,
): string {
  const params = new URLSearchParams({ categoryId: share.categoryId, from, to })
  if (share.splitByType) params.set('type', share.type)
  return `/expenses?${params}`
}

export type YearCategory = {
  key: string
  categoryId: string
  name: string
  type: BudgetType
  // True when "Other" was logged as both a need and a want this year (the link must name the type).
  splitByType: boolean
  spentPaise: number
}

export type YearReview = {
  year: number
  // Range covered by the year's cycles, for links to their expenses.
  from: string
  to: string
  cycles: number
  // Every cycle of the year has ended.
  complete: boolean
  incomePaise: number
  needsPaise: number
  wantsPaise: number
  investedPaise: number
  // Savings rule as everywhere: finished cycles with at least one expense.
  savedPaise: number
  savedCycles: number
  // Saved against the income of those same cycles; null when none counted yet.
  savingsRatePct: number | null
  needsOverCycles: number
  wantsOverCycles: number
  best: { month: string; ratePct: number } | null
  worst: { month: string; ratePct: number } | null
  biggest: { month: string; spentPaise: number } | null
  // Needs and wants only (investments are savings), biggest first.
  categories: YearCategory[]
  // Needs + wants of all categories, so shares of the top few stay true.
  categoriesTotalPaise: number
}

/**
 * The year in review: cycles that start in `year` (from GET /api/reports/cycles) and their spending
 * per category (from GET /api/reports/year). Null when the year has no cycles.
 */
export function yearReview(
  items: CycleHistoryItem[],
  categoryRows: CategoryTrends['rows'],
  year: number,
  today: string,
): YearReview | null {
  const inYear = items.filter((item) => Number(item.cycle.periodStart.slice(0, 4)) === year)
  if (inYear.length === 0) return null
  const counted = inYear.filter((item) => countsAsSaved(item, today))
  const sum = (list: CycleHistoryItem[], pick: (i: CycleHistoryItem) => number) => list.reduce((t, i) => t + pick(i), 0)
  const month = (i: CycleHistoryItem) => cycleMonth(i.cycle.periodStart, i.cycle.periodEnd)
  const rate = (i: CycleHistoryItem) => savingsRate(i.savedPaise, incomeOf(i.cycle)) ?? 0

  const rated = counted.map((i) => ({ month: month(i), ratePct: rate(i) }))
  // Best and toughest only mean something with two or more cycles to compare.
  const byRate = rated.length >= 2 ? [...rated].sort((a, b) => b.ratePct - a.ratePct) : []
  const spending = inYear
    .map((i) => ({ month: month(i), spentPaise: i.needsSpentPaise + i.wantsSpentPaise }))
    .filter((s) => s.spentPaise > 0)
    .sort((a, b) => b.spentPaise - a.spentPaise)

  const totals = new Map<string, YearCategory>()
  const types = new Map<string, Set<BudgetType>>()
  for (const row of categoryRows) {
    if (row.type === 'INVESTMENT') continue
    const key = `${row.categoryId}:${row.type}`
    const entry = totals.get(key) ?? {
      key,
      categoryId: row.categoryId,
      name: row.name,
      type: row.type,
      splitByType: false,
      spentPaise: 0,
    }
    entry.spentPaise += row.spentPaise
    totals.set(key, entry)
    types.set(row.categoryId, (types.get(row.categoryId) ?? new Set()).add(row.type))
  }
  const categories = [...totals.values()]
    .map((c) => {
      const split = types.get(c.categoryId)!.size > 1
      return { ...c, splitByType: split, name: split ? `${c.name} (${c.type === 'NEED' ? 'needs' : 'wants'})` : c.name }
    })
    .filter((c) => c.spentPaise > 0)
    .sort((a, b) => b.spentPaise - a.spentPaise || a.name.localeCompare(b.name))

  const savedPaise = sum(counted, (i) => i.savedPaise)
  const countedIncome = sum(counted, (i) => incomeOf(i.cycle))
  return {
    year,
    from: inYear[0].cycle.periodStart,
    to: inYear[inYear.length - 1].cycle.periodEnd,
    cycles: inYear.length,
    complete: inYear.every((i) => i.cycle.periodEnd < today),
    incomePaise: sum(inYear, (i) => incomeOf(i.cycle)),
    needsPaise: sum(inYear, (i) => i.needsSpentPaise),
    wantsPaise: sum(inYear, (i) => i.wantsSpentPaise),
    investedPaise: sum(inYear, (i) => i.investedPaise),
    savedPaise,
    savedCycles: counted.length,
    savingsRatePct: counted.length > 0 ? savingsRate(savedPaise, countedIncome) : null,
    needsOverCycles: inYear.filter((i) => i.needsSpentPaise > i.cycle.needsPaise).length,
    wantsOverCycles: inYear.filter((i) => i.wantsSpentPaise > i.cycle.wantsPaise).length,
    best: byRate[0] ?? null,
    worst: byRate.length >= 2 ? byRate[byRate.length - 1] : null,
    biggest: spending[0] ?? null,
    categories,
    categoriesTotalPaise: categories.reduce((t, c) => t + c.spentPaise, 0),
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Plain sentences for the year in review, most important first. */
export function yearReviewLines(review: YearReview): string[] {
  const lines: string[] = []
  const when = review.complete ? `in ${review.year}` : `in ${review.year} so far`
  if (review.savingsRatePct !== null) {
    lines.push(
      review.savedPaise < 0
        ? `Spending was ${formatPaiseShort(-review.savedPaise)} more than your income ${when}, over ${plural(review.savedCycles, 'finished cycle')}.`
        : `You saved ${formatPaiseShort(review.savedPaise)} ${when}, ${review.savingsRatePct}% of your income over ${plural(review.savedCycles, 'finished cycle')}.`,
    )
  }
  if (review.best && review.worst && review.best.ratePct !== review.worst.ratePct) {
    lines.push(
      `Best cycle: ${review.best.month} (${review.best.ratePct}% saved). Toughest: ${review.worst.month} (${review.worst.ratePct}%).`,
    )
  }
  const top = review.categories[0]
  if (top && review.categoriesTotalPaise > 0) {
    const share = Math.round((top.spentPaise * 100) / review.categoriesTotalPaise)
    lines.push(`${top.name} took the most: ${formatPaiseShort(top.spentPaise)}, ${share}% of needs and wants.`)
  }
  if (review.needsOverCycles === 0 && review.wantsOverCycles === 0) {
    lines.push(`Needs and wants stayed within plan in every cycle ${when}.`)
  } else {
    const parts = [
      review.needsOverCycles > 0 ? `needs in ${plural(review.needsOverCycles, 'cycle')}` : null,
      review.wantsOverCycles > 0 ? `wants in ${plural(review.wantsOverCycles, 'cycle')}` : null,
    ].filter(Boolean)
    lines.push(`Over plan: ${parts.join(' and ')} of ${review.cycles}.`)
  }
  return lines
}
