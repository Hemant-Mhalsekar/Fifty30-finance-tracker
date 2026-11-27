import { afterEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, onLoggedOut, refreshSession, REFRESH_RETRY_DELAY_MS, SESSION_UNREACHABLE_MESSAGE } from './api'

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

describe('refreshSession', () => {
  it('reports logged out when the server refuses the cookie, without retrying', async () => {
    const fetchMock = vi.fn().mockResolvedValue(json(401, { message: 'Invalid refresh token' }))
    vi.stubGlobal('fetch', fetchMock)

    expect(await refreshSession()).toBe('loggedOut')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('retries once after a network error and succeeds', async () => {
    vi.useFakeTimers()
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(json(200, { accessToken: 'new-token' }))
    vi.stubGlobal('fetch', fetchMock)

    const result = refreshSession()
    await vi.advanceTimersByTimeAsync(REFRESH_RETRY_DELAY_MS)

    expect(await result).toBe('ok')
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('keeps the user signed in when the server stays unreachable', async () => {
    vi.useFakeTimers()
    const loggedOut = vi.fn()
    const stop = onLoggedOut(loggedOut)
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(401, { message: 'Missing or invalid access token' }))
      .mockImplementation(() => Promise.resolve(new Response('', { status: 504 })))
    vi.stubGlobal('fetch', fetchMock)

    const pending = apiFetch('/api/me')
    await vi.advanceTimersByTimeAsync(REFRESH_RETRY_DELAY_MS)
    const response = await pending
    stop()

    expect(response.status).toBe(503)
    expect((await response.json()).message).toBe(SESSION_UNREACHABLE_MESSAGE)
    // The request itself and two refresh attempts: never a third use of the same refresh cookie.
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(loggedOut).not.toHaveBeenCalled()
  })
})
