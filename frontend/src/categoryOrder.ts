import type { Category } from './api'

/** Active categories, the most recently used first, then the rest by name. */
export function orderByRecentUse(categories: Category[], recentCategoryIds: string[]): Category[] {
  const rank = new Map<string, number>()
  for (const categoryId of recentCategoryIds) {
    if (!rank.has(categoryId)) rank.set(categoryId, rank.size)
  }
  return categories
    .filter((c) => !c.archived)
    .sort((a, b) => {
      const ra = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER
      const rb = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER
      return ra - rb || a.name.localeCompare(b.name)
    })
}
