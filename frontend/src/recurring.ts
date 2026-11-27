import type { Frequency, RecurringSchedule } from './api'

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
export const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]

export const FREQUENCY_LABELS: Record<Frequency, string> = { WEEKLY: 'Weekly', MONTHLY: 'Monthly', YEARLY: 'Yearly' }

/** 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd, 31st. */
export function ordinal(day: number): string {
  const lastTwo = day % 100
  if (lastTwo >= 11 && lastTwo <= 13) return `${day}th`
  switch (day % 10) {
    case 1:
      return `${day}st`
    case 2:
      return `${day}nd`
    case 3:
      return `${day}rd`
    default:
      return `${day}th`
  }
}

/** Most days a month can have; 29 for February, which is due on the 28th in other years. */
export function daysInMonth(month: number): number {
  return [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

/**
 * "Every Saturday", "Every month on the 5th", "Every year on 15 March". The full label also says
 * where a day that some months or years lack falls; brief leaves that out, for one-line lists.
 */
export function scheduleLabel(s: RecurringSchedule, brief = false): string {
  if (s.frequency === 'WEEKLY') return `Every ${WEEKDAYS[(s.dayOfWeek ?? 1) - 1]}`
  const day = s.dayOfMonth ?? 1
  if (s.frequency === 'YEARLY') {
    const base = `Every year on ${day} ${MONTHS[(s.monthOfYear ?? 1) - 1]}`
    return s.monthOfYear === 2 && day === 29 && !brief ? `${base} (28 February in other years)` : base
  }
  const base = `Every month on the ${ordinal(day)}`
  return day >= 29 && !brief ? `${base} (or the last day of shorter months)` : base
}

/** "week", "month" or "year": for sentences like "Skip it this month". */
export function periodWord(frequency: Frequency): string {
  return frequency === 'WEEKLY' ? 'week' : frequency === 'YEARLY' ? 'year' : 'month'
}
