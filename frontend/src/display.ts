// Small display rules for the redesigned screens, kept pure so they are unit-tested.
import type { BudgetType, CategorySpend, CycleReport } from './api'
import { addDays, todayIst } from './dates'

const IST_HOUR = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hourCycle: 'h23' })

/** "Good morning" before noon, "Good afternoon" until 5 pm, then "Good evening" (India time). */
export function greeting(now: Date = new Date()): string {
  const hour = Number(IST_HOUR.format(now))
  if (hour >= 5 && hour < 12) return 'Good morning'
  if (hour >= 12 && hour < 17) return 'Good afternoon'
  return 'Good evening'
}

/** First word of the name for the greeting; null without a name. */
export function firstName(name: string | null): string | null {
  const first = name?.trim().split(/\s+/)[0]
  return first ? first : null
}

/** One letter for the avatar: the name's, else the email's. */
export function initial(name: string | null, email: string): string {
  return (name?.trim() || email).charAt(0).toUpperCase()
}

const IST_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})
const IST_TIME = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit' })

/**
 * "10:24 am" when the expense was logged on the day it happened; otherwise null, because the time
 * it was typed in says nothing about a purchase from an earlier day.
 */
export function loggedTime(createdAt: string | null, expenseDate: string): string | null {
  if (!createdAt) return null
  const at = new Date(createdAt)
  if (Number.isNaN(at.getTime()) || IST_DATE.format(at) !== expenseDate) return null
  return IST_TIME.format(at).replace(/\s+/g, ' ').toLowerCase()
}

const WEEKDAY_DAY_MONTH = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'UTC',
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const DAY_MONTH = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', day: 'numeric', month: 'short' })
const DAY_MONTH_YEAR = new Intl.DateTimeFormat('en-IN', {
  timeZone: 'UTC',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

function utc(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

/** "Today, 28 Nov", "Yesterday, 27 Nov", "Mon, 24 Nov", or "24 Nov 2025" in another year. */
export function dayLabel(iso: string, today: string = todayIst()): string {
  if (iso === today) return `Today, ${DAY_MONTH.format(utc(iso))}`
  if (iso === addDays(today, -1)) return `Yesterday, ${DAY_MONTH.format(utc(iso))}`
  if (iso.slice(0, 4) !== today.slice(0, 4)) return DAY_MONTH_YEAR.format(utc(iso))
  return WEEKDAY_DAY_MONTH.format(utc(iso))
}

/** Short date for list rows: "28 Nov". */
export function shortDate(iso: string): string {
  return DAY_MONTH.format(utc(iso))
}

export type Tone = 'good' | 'warn' | 'bad'

/**
 * How needs + wants spending compares with an even pace through the cycle. A little leeway (5%)
 * keeps one big grocery run from flipping the label.
 */
export function paceStatus(report: CycleReport, isCurrent: boolean): { label: string; tone: Tone } {
  const { needs, wants, days } = report
  if (needs.overspent || wants.overspent) return { label: 'Over plan', tone: 'bad' }
  if (!isCurrent) return { label: 'Within plan', tone: 'good' }
  const budget = needs.allocatedPaise + wants.allocatedPaise
  const spent = needs.spentPaise + wants.spentPaise
  const pace = days.total > 0 ? (budget * days.elapsed) / days.total : budget
  if (spent > pace * 1.05) return { label: 'Ahead of pace', tone: 'warn' }
  return { label: 'On track', tone: 'good' }
}

/** Percent of a whole, rounded, for labels; 0 when there is no whole. */
export function percentOf(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0
}

export const SLICE_COLORS = [
  'var(--need)',
  'var(--want)',
  'var(--purple)',
  'var(--amber)',
  'var(--save)',
  'var(--slate)',
]

export type Slice = { key: string; name: string; type: BudgetType | null; spentPaise: number; color: string }

/**
 * Spending categories for the donut: the biggest few, then "N more" so the ring stays readable.
 * Investments are savings, not spending, so they are left out (as in "Spent" and the reports).
 * Other appears once per type it was logged as, so those rows are merged by category first.
 */
export function donutSlices(categories: CategorySpend[], max = 5): Slice[] {
  const merged = new Map<string, Slice>()
  for (const c of categories) {
    if (c.type === 'INVESTMENT') continue
    const existing = merged.get(c.categoryId)
    if (existing) {
      existing.spentPaise += c.spentPaise
      existing.type = null
    } else {
      merged.set(c.categoryId, { key: c.categoryId, name: c.name, type: c.type, spentPaise: c.spentPaise, color: '' })
    }
  }
  const sorted = [...merged.values()].filter((s) => s.spentPaise > 0).sort((a, b) => b.spentPaise - a.spentPaise)
  const shown = sorted.length > max ? sorted.slice(0, max - 1) : sorted
  const rest = sorted.slice(shown.length)
  const slices = shown.map((s, i) => ({ ...s, color: SLICE_COLORS[i] }))
  if (rest.length > 0) {
    slices.push({
      key: 'rest',
      name: `${rest.length} more`,
      type: null,
      spentPaise: rest.reduce((sum, s) => sum + s.spentPaise, 0),
      color: SLICE_COLORS[SLICE_COLORS.length - 1],
    })
  }
  return slices
}

/** CSS class suffix for a budget type ("need", "want", "investment"). */
export function typeClass(type: BudgetType | null): string {
  return type ? type.toLowerCase() : ''
}

/** Days left in a cycle counting today: "20 days left", "Last day". */
export function daysLeftLabel(periodEnd: string, today: string = todayIst()): string {
  const days = Math.round((utc(periodEnd).getTime() - utc(today).getTime()) / 86_400_000) + 1
  if (days <= 0) return 'Ended'
  return days === 1 ? 'Last day' : `${days} days left`
}
