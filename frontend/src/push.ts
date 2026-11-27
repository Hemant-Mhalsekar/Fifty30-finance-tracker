import { getPushKey, subscribePush, unsubscribePush, type PushSubscriptionInfo } from './api'

// Push notifications on this device. The service worker (public/sw.js) shows them; the server
// sends them. The service worker is registered only in production builds, so in development
// the state is 'unavailable'.

export type PushState =
  | 'unsupported' // this browser has no Web Push
  | 'unavailable' // no service worker (development) or the server has no keys
  | 'denied' // the person blocked notifications for this site
  | 'off'
  | 'on'

export function pushSupported(): boolean {
  return (
    typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  )
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null
  return (await navigator.serviceWorker.getRegistration('/')) ?? null
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  const reg = await registration()
  if (!reg) return 'unavailable'
  const subscription = await reg.pushManager.getSubscription()
  if (subscription && Notification.permission === 'granted') return 'on'
  return (await getPushKey()) ? 'off' : 'unavailable'
}

/**
 * Asks for permission (must run from a tap), subscribes with the server's key and tells the
 * server. Returns the new state; throws only when the server refuses the subscription.
 */
export async function enablePush(): Promise<PushState> {
  const reg = await registration()
  if (!reg) return pushSupported() ? 'unavailable' : 'unsupported'
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission === 'denied' ? 'denied' : 'off'
  const key = await getPushKey()
  if (!key) return 'unavailable'
  const subscription = await subscribeWith(reg, key)
  await subscribePush(toInfo(subscription))
  return 'on'
}

/** Turns this device off: on the server first (so nothing more is sent), then in the browser. */
export async function disablePush(): Promise<void> {
  const reg = await registration()
  const subscription = await reg?.pushManager.getSubscription()
  if (!subscription) return
  try {
    await unsubscribePush(subscription.endpoint)
  } finally {
    await subscription.unsubscribe().catch(() => false)
  }
}

/**
 * On every app start for a signed-in person: re-sends this device's subscription, so the
 * server always has the current keys and it belongs to whoever is signed in. If the server's
 * key changed, subscribes again with the new one. Never throws.
 */
export async function syncPush(): Promise<void> {
  try {
    if (!pushSupported() || Notification.permission !== 'granted') return
    const reg = await registration()
    const current = await reg?.pushManager.getSubscription()
    if (!reg || !current) return
    const key = await getPushKey()
    if (!key) return
    const subscription = sameKey(current.options.applicationServerKey, key)
      ? current
      : await resubscribe(reg, current, key)
    await subscribePush(toInfo(subscription))
  } catch {
    // Best effort: notifications simply stay as they were.
  }
}

async function resubscribe(reg: ServiceWorkerRegistration, old: PushSubscription, key: string) {
  await old.unsubscribe().catch(() => false)
  return subscribeWith(reg, key)
}

function subscribeWith(reg: ServiceWorkerRegistration, key: string): Promise<PushSubscription> {
  // userVisibleOnly: every push shows a notification; browsers require it.
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64UrlToBytes(key) })
}

function toInfo(subscription: PushSubscription): PushSubscriptionInfo {
  const json = subscription.toJSON()
  return { endpoint: subscription.endpoint, keys: { p256dh: json.keys?.p256dh ?? '', auth: json.keys?.auth ?? '' } }
}

function sameKey(current: ArrayBuffer | null, key: string): boolean {
  if (!current) return false
  const a = new Uint8Array(current)
  const b = base64UrlToBytes(key)
  return a.length === b.length && a.every((byte, i) => byte === b[i])
}

/** base64url (no padding) to bytes, as PushManager.subscribe wants the key. */
export function base64UrlToBytes(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(text.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}
