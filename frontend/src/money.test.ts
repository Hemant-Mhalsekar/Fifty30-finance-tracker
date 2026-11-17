import { describe, expect, it } from 'vitest'
import { formatPaise, formatPaiseCompact, formatPaiseShort, paiseToInput, parseRupeesToPaise, splitBudget } from './money'

describe('parseRupeesToPaise', () => {
  it.each([
    ['500', 50_000],
    ['0.1', 10], // the classic float trap: must be exactly 10 paise
    ['0.01', 1],
    ['1200.5', 120_050],
    ['1,23,456.78', 12_345_678],
    ['₹ 500', 50_000],
    ['  42  ', 4_200],
    ['007', 700],
    ['0', 0],
    ['100000000', 10_000_000_000],
  ])('parses %j as %d paise', (text, paise) => {
    expect(parseRupeesToPaise(text)).toBe(paise)
  })

  it.each(['', 'abc', '-5', '1.234', '500.', '.5', '1e3', '12.3.4', '99999999999999'])('rejects %j', (text) => {
    expect(parseRupeesToPaise(text)).toBeNull()
  })
})

describe('formatPaise', () => {
  it.each([
    [0, '₹0.00'],
    [5, '₹0.05'],
    [50_000, '₹500.00'],
    [12_345_678, '₹1,23,456.78'],
    [10_000_000_000, '₹10,00,00,000.00'],
    [-500, '-₹5.00'],
    [-12_345_678, '-₹1,23,456.78'],
  ])('formats %d as %s', (paise, text) => {
    expect(formatPaise(paise)).toBe(text)
  })
})

describe('paiseToInput', () => {
  it.each([
    [50_000, '500'],
    [120_050, '1200.50'],
    [5, '0.05'],
    [0, '0'],
  ])('turns %d into %j', (paise, text) => {
    expect(paiseToInput(paise)).toBe(text)
  })

  it('round-trips through parseRupeesToPaise', () => {
    for (const paise of [1, 99, 100, 120_050, 999_999_999, 10_000_000_000]) {
      expect(parseRupeesToPaise(paiseToInput(paise))).toBe(paise)
    }
  })
})

describe('splitBudget', () => {
  it('matches the backend: floor for needs and wants, remainder to savings', () => {
    expect(splitBudget(1_000_001)).toEqual({ needs: 500_000, wants: 300_000, savings: 200_001 })
  })

  it('always adds up to the salary', () => {
    for (const salary of [100, 101, 333, 999_999, 1_000_000_000]) {
      const { needs, wants, savings } = splitBudget(salary)
      expect(needs + wants + savings).toBe(salary)
    }
  })
})

describe('formatPaiseShort', () => {
  it.each([
    [2_500_000, '₹25,000'],
    [133_250, '₹1,332.50'],
    [0, '₹0'],
    [-1_000_000, '-₹10,000'],
    [-505, '-₹5.05'],
  ])('formats %d as %s', (paise, text) => {
    expect(formatPaiseShort(paise)).toBe(text)
  })
})

describe('formatPaiseCompact', () => {
  it.each([
    [0, '₹0'],
    [50_000, '₹500'],
    [99_900, '₹999'],
    [100_000, '₹1k'],
    [125_000, '₹1.3k'],
    [2_500_000, '₹25k'],
    [9_999_900, '₹100k'],
    [10_000_000, '₹1L'],
    [15_000_000, '₹1.5L'],
    [250_000_000, '₹25L'],
    [1_000_000_000, '₹1Cr'],
    [-2_500_000, '−₹25k'],
  ])('%i -> %s', (paise, expected) => {
    expect(formatPaiseCompact(paise)).toBe(expected)
  })
})
