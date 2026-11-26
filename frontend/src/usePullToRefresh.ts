import { useEffect, useRef, useState } from 'react'

// How far (after damping) a pull must go before letting go refreshes.
export const PULL_THRESHOLD = 64
const MAX_PULL = 96
// Finger travel is halved, so the indicator lags behind like a native pull.
const DAMPING = 0.5

export type PullState = { distance: number; ready: boolean }

/** Damped pull distance for a finger that has moved `dy` pixels down; 0 when moving up. */
export function pullDistance(dy: number): number {
  return Math.max(0, Math.min(MAX_PULL, dy * DAMPING))
}

/**
 * Pull down at the very top of the page to refresh, as in phone apps. An installed app has no
 * reload button. Only starts at scroll position 0, and not from inside a field or a sideways
 * scroller (the report switch, a wide table), so normal scrolling and typing are untouched.
 */
export function usePullToRefresh(onRefresh: () => void): PullState {
  const [state, setState] = useState<PullState>({ distance: 0, ready: false })
  const refresh = useRef(onRefresh)
  useEffect(() => {
    refresh.current = onRefresh
  })

  useEffect(() => {
    let startY: number | null = null
    let distance = 0

    function onStart(e: TouchEvent) {
      const target = e.target as Element | null
      const blocked = target?.closest('input, textarea, select, [contenteditable], .segmented, .table-view')
      startY = window.scrollY <= 0 && e.touches.length === 1 && !blocked ? e.touches[0].clientY : null
      distance = 0
    }
    function onMove(e: TouchEvent) {
      if (startY === null) return
      if (window.scrollY > 0) {
        startY = null
        setState({ distance: 0, ready: false })
        return
      }
      distance = pullDistance(e.touches[0].clientY - startY)
      setState({ distance, ready: distance >= PULL_THRESHOLD })
    }
    function onEnd() {
      if (startY !== null && distance >= PULL_THRESHOLD) refresh.current()
      startY = null
      distance = 0
      setState({ distance: 0, ready: false })
    }

    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: true })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  return state
}
