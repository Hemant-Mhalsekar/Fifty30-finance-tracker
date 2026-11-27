import type { BudgetType, CycleReport } from './api'
import { formatPaise } from './money'

// Needs and wants warn at 80% of their plan and again when the plan is used up.
// Investments are savings, so they never warn.
export const ALERT_AT_PERCENT = 80

export type AlertType = Extract<BudgetType, 'NEED' | 'WANT'>
export type AlertLevel = 'near' | 'reached'

export interface BudgetAlert {
  type: AlertType
  level: AlertLevel
  allocatedPaise: number
  spentPaise: number
  /** Whole percent of the plan used, rounded down (101% only once it is really over). */
  percent: number
  /** True when spending is above the plan, not just equal to it. */
  over: boolean
}

const NAMES: Record<AlertType, string> = { NEED: 'Needs', WANT: 'Wants' }

/** The level reached by this much spending, or null below 80%. Integer maths, no rounding surprises. */
export function alertLevel(spentPaise: number, allocatedPaise: number): AlertLevel | null {
  if (allocatedPaise <= 0) return spentPaise > 0 ? 'reached' : null
  if (spentPaise >= allocatedPaise) return 'reached'
  if (spentPaise * 100 >= allocatedPaise * ALERT_AT_PERCENT) return 'near'
  return null
}

/** Alerts for needs and wants in this cycle, needs first. */
export function budgetAlerts(report: CycleReport): BudgetAlert[] {
  const alerts: BudgetAlert[] = []
  for (const type of ['NEED', 'WANT'] as const) {
    const line = type === 'NEED' ? report.needs : report.wants
    const level = alertLevel(line.spentPaise, line.allocatedPaise)
    if (!level) continue
    alerts.push({
      type,
      level,
      allocatedPaise: line.allocatedPaise,
      spentPaise: line.spentPaise,
      percent: line.allocatedPaise > 0 ? Math.floor((line.spentPaise * 100) / line.allocatedPaise) : 100,
      over: line.spentPaise > line.allocatedPaise,
    })
  }
  return alerts
}

/** Dashboard sentence. daysLeft counts today. */
export function alertText(alert: BudgetAlert, daysLeft: number): string {
  const name = NAMES[alert.type]
  const days = `${daysLeft} ${daysLeft === 1 ? 'day' : 'days'}`
  if (alert.over) {
    return `${name} are ${formatPaise(alert.spentPaise - alert.allocatedPaise)} over plan. The extra comes out of savings.`
  }
  if (alert.level === 'reached') return `${name}: the whole plan is used, with ${days} to go.`
  return `${name}: ${alert.percent}% of the plan used, ${formatPaise(alert.allocatedPaise - alert.spentPaise)} left for ${days}.`
}

/**
 * After saving an expense: the level this one expense pushed its bucket into, or null when it
 * crossed nothing (already past that line, or still below 80%).
 */
export function crossedLevel(spentAfterPaise: number, amountPaise: number, allocatedPaise: number): AlertLevel | null {
  const after = alertLevel(spentAfterPaise, allocatedPaise)
  const before = alertLevel(spentAfterPaise - amountPaise, allocatedPaise)
  if (after === before) return null
  return after
}

/** Short sentence added to the "Saved" message when an expense crosses a line. */
export function crossedText(type: AlertType, level: AlertLevel, spentPaise: number, allocatedPaise: number): string {
  const name = NAMES[type].toLowerCase()
  if (spentPaise > allocatedPaise)
    return `Heads up: ${name} are now ${formatPaise(spentPaise - allocatedPaise)} over plan.`
  if (level === 'reached') return `Heads up: that uses up the ${name} plan for this cycle.`
  const percent = Math.floor((spentPaise * 100) / allocatedPaise)
  return `Heads up: ${name} are at ${percent}% of the plan, ${formatPaise(allocatedPaise - spentPaise)} left.`
}
