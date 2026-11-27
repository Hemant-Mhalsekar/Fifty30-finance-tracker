import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearApiCache } from './apiCache'
import { base64UrlToBytes, disablePush, enablePush, pushState, syncPush } from './push'

const KEY = 'BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U'
const OTHER_KEY = 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM'

type FakeSubscription = {
  endpoint: string
  options: { applicationServerKey: ArrayBuffer | null }
  toJSON: () => { keys: { p256dh: string; auth: string } }
  unsubscribe: ReturnType<typeof vi.fn>
}

function fakeSubscription(endpoint: string, key: string): FakeSubscription {
  return {
    endpoint,
    options: { applicationServerKey: base64UrlToBytes(key).buffer },
    toJSON: () => ({ keys: { p256dh: 'p256dh-value', auth: 'auth-value' } }),
    unsubscribe: vi.fn().mockResolvedValue(true),
  }
}

let current: FakeSubscription | null
let permission: NotificationPermission
let requests: { path: string; method: string; body: unknown }[]
const subscribe = vi.fn()

beforeEach(() => {
  clearApiCache()
  current = null
  permission = 'default'
  requests = []
  subscribe.mockReset()
  subscribe.mockImplementation(async (options: { applicationServerKey: Uint8Array }) => {
    current = fakeSubscription('https://fcm.googleapis.com/fcm/send/new', toBase64Url(options.applicationServerKey))
    return current
  })
  const registration = {
    pushManager: { getSubscription: async () => current, subscribe },
  }
  vi.stubGlobal('window', { PushManager: class {}, Notification: class {} })
  vi.stubGlobal('navigator', { serviceWorker: { getRegistration: async () => registration } })
  vi.stubGlobal('Notification', {
    get permission() {
      return permission
    },
    requestPermission: vi.fn(async () => permission),
  })
  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit = {}) => {
      const method = (init.method ?? 'GET').toUpperCase()
      requests.push({ path, method, body: init.body ? JSON.parse(String(init.body)) : null })
      if (path === '/api/notifications/key') return Response.json({ publicKey: KEY })
      return new Response(null, { status: 204 })
    }),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function toBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

describe('push', () => {
  it('decodes the server key into the bytes PushManager wants', () => {
    const bytes = base64UrlToBytes(KEY)
    expect(bytes.length).toBe(65)
    expect(bytes[0]).toBe(4)
    expect(toBase64Url(bytes)).toBe(KEY)
  })

  it('turns on: permission from the tap, subscribe with the server key, tell the server', async () => {
    permission = 'granted'
    expect(await pushState()).toBe('off')
    expect(await enablePush()).toBe('on')
    expect(toBase64Url(subscribe.mock.calls[0][0].applicationServerKey)).toBe(KEY)
    expect(subscribe.mock.calls[0][0].userVisibleOnly).toBe(true)
    expect(requests.at(-1)).toEqual({
      path: '/api/notifications/subscribe',
      method: 'POST',
      body: {
        endpoint: 'https://fcm.googleapis.com/fcm/send/new',
        keys: { p256dh: 'p256dh-value', auth: 'auth-value' },
      },
    })
    expect(await pushState()).toBe('on')
  })

  it('stops when the person blocks notifications, and says so', async () => {
    permission = 'denied'
    expect(await enablePush()).toBe('denied')
    expect(subscribe).not.toHaveBeenCalled()
    expect(await pushState()).toBe('denied')
  })

  it('turns off on the server first, then in the browser', async () => {
    permission = 'granted'
    const subscription = fakeSubscription('https://fcm.googleapis.com/fcm/send/old', KEY)
    current = subscription
    await disablePush()
    expect(requests.at(-1)).toMatchObject({
      path: '/api/notifications/unsubscribe',
      body: { endpoint: 'https://fcm.googleapis.com/fcm/send/old' },
    })
    expect(subscription.unsubscribe).toHaveBeenCalled()
  })

  it('on start, re-sends the subscription, and subscribes again if the server key changed', async () => {
    permission = 'granted'
    current = fakeSubscription('https://fcm.googleapis.com/fcm/send/same', KEY)
    await syncPush()
    expect(subscribe).not.toHaveBeenCalled()
    expect(requests.at(-1)).toMatchObject({ body: { endpoint: 'https://fcm.googleapis.com/fcm/send/same' } })

    const stale = fakeSubscription('https://fcm.googleapis.com/fcm/send/stale', OTHER_KEY)
    current = stale
    await syncPush()
    expect(stale.unsubscribe).toHaveBeenCalled()
    expect(subscribe).toHaveBeenCalledTimes(1)
    expect(requests.at(-1)).toMatchObject({ body: { endpoint: 'https://fcm.googleapis.com/fcm/send/new' } })
  })
})
