// When the dashboard may suggest installing the app. "Not now" hides it for 30 days on this
// device; the More page keeps the permanent way to install.

const KEY = 'fifty30-install-dismissed'
export const SNOOZE_DAYS = 30

export function installSnoozed(now: number = Date.now()): boolean {
  try {
    const at = Number(localStorage.getItem(KEY))
    return Number.isFinite(at) && at > 0 && now - at < SNOOZE_DAYS * 86_400_000
  } catch {
    return false
  }
}

export function snoozeInstall(now: number = Date.now()): void {
  try {
    localStorage.setItem(KEY, String(now))
  } catch {
    // Private mode or storage off: it simply shows again next time.
  }
}
