import { describe, expect, it } from 'vitest'
import { PULL_THRESHOLD, pullDistance } from './usePullToRefresh'

describe('pullDistance', () => {
  it('halves the finger travel, ignores upward moves and stops at a maximum', () => {
    expect(pullDistance(-40)).toBe(0)
    expect(pullDistance(100)).toBe(50)
    expect(pullDistance(1000)).toBe(96)
  })

  it('needs a deliberate pull: 128 px of finger travel', () => {
    expect(pullDistance(PULL_THRESHOLD * 2 - 1)).toBeLessThan(PULL_THRESHOLD)
    expect(pullDistance(PULL_THRESHOLD * 2)).toBe(PULL_THRESHOLD)
  })
})
