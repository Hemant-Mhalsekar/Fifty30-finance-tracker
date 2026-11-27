import type { RecurringExpense } from './api'

// The number on the app icon: recurring payments waiting for Add or Skip. Installed apps on
// desktop show the number; Android shows a dot. Browsers without the Badging API ignore it.

type BadgingNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

export function dueCount(items: RecurringExpense[]): number {
  return items.filter((item) => item.due).length
}

export async function showDueOnAppIcon(count: number): Promise<void> {
  const nav = navigator as BadgingNavigator
  try {
    if (count > 0) await nav.setAppBadge?.(count)
    else await nav.clearAppBadge?.()
  } catch {
    // Not allowed here (for example a browser tab): the badge is only a nicety.
  }
}
