import { describe, expect, it } from 'vitest'
import type { Category, Expense } from './api'
import { quickRepeats, repeatExpense } from './quickRepeats'

const categories: Category[] = [
  { id: 'travel', name: 'Transport', type: 'NEED', archived: false },
  { id: 'food', name: 'Dining', type: 'WANT', archived: false },
  { id: 'other', name: 'Other', type: null, archived: false },
  { id: 'old', name: 'Gym', type: 'WANT', archived: true },
]

let n = 0
const expense = (categoryId: string, description: string, amountPaise: number, type = 'NEED'): Expense =>
  ({ id: `e${n++}`, categoryId, description, amountPaise, type, expenseDate: '2026-11-20', createdAt: null }) as Expense

describe('quickRepeats', () => {
  it('keeps what was logged at least twice, most often first, then most recent', () => {
    const recent = [
      expense('food', 'Chai', 2_000, 'WANT'),
      expense('travel', 'Metro', 4_000),
      expense('food', 'chai ', 2_000, 'WANT'), // same, ignoring case and spaces
      expense('travel', 'Metro', 4_000),
      expense('travel', 'Metro', 4_000),
      expense('food', 'Lunch', 25_000, 'WANT'), // once only
      expense('travel', 'Metro', 6_000), // a different amount is a different habit
    ]
    expect(quickRepeats(recent, categories).map((r) => [r.description, r.amountPaise, r.count])).toEqual([
      ['Metro', 4_000, 3],
      ['Chai', 2_000, 2],
    ])
  })

  it('leaves out archived categories and keeps the type only for Other', () => {
    const recent = [
      expense('old', 'Gym', 100_000, 'WANT'),
      expense('old', 'Gym', 100_000, 'WANT'),
      expense('other', 'Parking', 3_000, 'NEED'),
      expense('other', 'Parking', 3_000, 'NEED'),
    ]
    const repeats = quickRepeats(recent, categories)
    expect(repeats).toHaveLength(1)
    expect(repeatExpense(repeats[0], '2026-11-27')).toEqual({
      amountPaise: 3_000,
      categoryId: 'other',
      description: 'Parking',
      expenseDate: '2026-11-27',
      type: 'NEED',
    })
  })

  it('stops at the limit', () => {
    const recent = ['A', 'B', 'C'].flatMap((d) => [expense('travel', d, 100), expense('travel', d, 100)])
    expect(quickRepeats(recent, categories, 2)).toHaveLength(2)
  })
})
