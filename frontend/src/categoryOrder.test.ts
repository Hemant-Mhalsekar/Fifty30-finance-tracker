import { describe, expect, it } from 'vitest'
import type { Category } from './api'
import { orderByRecentUse } from './categoryOrder'

const cat = (id: string, name: string, archived = false): Category => ({ id, name, type: 'NEED', archived })

describe('orderByRecentUse', () => {
  const all = [cat('r', 'Rent'), cat('g', 'Groceries'), cat('d', 'Dining'), cat('x', 'Old', true), cat('t', 'Transport')]

  it('puts the most recently used first, in order of last use, then the rest by name', () => {
    // Newest expense first, as the API returns them; repeats keep their first (newest) position.
    const ordered = orderByRecentUse(all, ['d', 'r', 'd', 'g'])
    expect(ordered.map((c) => c.id)).toEqual(['d', 'r', 'g', 't'])
  })

  it('falls back to alphabetical order with no history', () => {
    expect(orderByRecentUse(all, []).map((c) => c.name)).toEqual(['Dining', 'Groceries', 'Rent', 'Transport'])
  })

  it('never offers archived categories, even if recently used', () => {
    expect(orderByRecentUse(all, ['x']).map((c) => c.id)).not.toContain('x')
  })
})
