import { describe, expect, it } from 'vitest'
import { ordinal, scheduleLabel } from './recurring'

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
    expect(scheduleLabel(5)).toBe('Every month on the 5th')
    expect(scheduleLabel(28)).toBe('Every month on the 28th')
  })

  it('explains days that short months do not have', () => {
    expect(scheduleLabel(29)).toBe('Every month on the 29th (or the last day of shorter months)')
    expect(scheduleLabel(31)).toBe('Every month on the 31st (or the last day of shorter months)')
  })
})
