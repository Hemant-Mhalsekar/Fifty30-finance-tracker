import { describe, expect, it } from 'vitest'
import type { RecurringSchedule } from './api'
import { daysInMonth, ordinal, periodWord, scheduleLabel } from './recurring'

const monthly = (dayOfMonth: number): RecurringSchedule => ({
  frequency: 'MONTHLY',
  dayOfMonth,
  dayOfWeek: null,
  monthOfYear: null,
})

describe('ordinal', () => {
  it.each([
    [1, '1st'],
    [2, '2nd'],
    [3, '3rd'],
    [4, '4th'],
    [11, '11th'],
    [12, '12th'],
    [13, '13th'],
    [21, '21st'],
    [22, '22nd'],
    [23, '23rd'],
    [30, '30th'],
    [31, '31st'],
  ])('%i -> %s', (day, expected) => {
    expect(ordinal(day)).toBe(expected)
  })
})

describe('scheduleLabel', () => {
  it('names the day', () => {
    expect(scheduleLabel(monthly(5))).toBe('Every month on the 5th')
    expect(scheduleLabel(monthly(28))).toBe('Every month on the 28th')
  })

  it('explains days that short months do not have', () => {
    expect(scheduleLabel(monthly(29))).toBe('Every month on the 29th (or the last day of shorter months)')
    expect(scheduleLabel(monthly(31))).toBe('Every month on the 31st (or the last day of shorter months)')
  })

  it('names the weekday and the date of the year', () => {
    expect(scheduleLabel({ frequency: 'WEEKLY', dayOfMonth: null, dayOfWeek: 6, monthOfYear: null })).toBe(
      'Every Saturday',
    )
    expect(scheduleLabel({ frequency: 'YEARLY', dayOfMonth: 15, dayOfWeek: null, monthOfYear: 3 })).toBe(
      'Every year on 15 March',
    )
    expect(scheduleLabel({ frequency: 'YEARLY', dayOfMonth: 29, dayOfWeek: null, monthOfYear: 2 })).toBe(
      'Every year on 29 February (28 February in other years)',
    )
  })

  it('has a brief form for lists, without the note about short months', () => {
    expect(scheduleLabel(monthly(31), true)).toBe('Every month on the 31st')
    expect(scheduleLabel({ frequency: 'YEARLY', dayOfMonth: 29, dayOfWeek: null, monthOfYear: 2 }, true)).toBe(
      'Every year on 29 February',
    )
    expect(scheduleLabel({ frequency: 'WEEKLY', dayOfMonth: null, dayOfWeek: 1, monthOfYear: null }, true)).toBe(
      'Every Monday',
    )
  })

  it('knows the longest month lengths and the period words', () => {
    expect([2, 4, 12].map(daysInMonth)).toEqual([29, 30, 31])
    expect(periodWord('WEEKLY')).toBe('week')
    expect(periodWord('YEARLY')).toBe('year')
  })
})
