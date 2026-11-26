import { afterEach, describe, expect, it, vi } from 'vitest'
import { CACHE_TTL_MS, cachedGet, clearApiCache } from './apiCache'

afterEach(() => clearApiCache())

describe('cachedGet', () => {
  it('answers a repeat from memory until it is two minutes old', async () => {
    let clock = 1_000
    const load = vi.fn(async () => ({ total: 5 }))
    expect(await cachedGet('/a', load, () => clock)).toEqual({ total: 5 })
    clock += CACHE_TTL_MS - 1
    expect(await cachedGet('/a', load, () => clock)).toEqual({ total: 5 })
    expect(load).toHaveBeenCalledTimes(1)
    clock += 1
    await cachedGet('/a', load, () => clock)
    expect(load).toHaveBeenCalledTimes(2)
  })

  it('shares one request between callers asking at the same time', async () => {
    const load = vi.fn(async () => [1, 2])
    const [a, b] = await Promise.all([cachedGet('/b', load), cachedGet('/b', load)])
    expect(load).toHaveBeenCalledTimes(1)
    expect(a).toEqual(b)
  })

  it('hands out copies, so a caller cannot change what the next one sees', async () => {
    const first = await cachedGet('/c', async () => ({ items: [3, 1, 2] }))
    first.items.sort()
    expect(await cachedGet('/c', async () => ({ items: [] }))).toEqual({ items: [3, 1, 2] })
  })

  it('never stores a failure', async () => {
    await expect(cachedGet('/d', async () => Promise.reject(new Error('down')))).rejects.toThrow('down')
    expect(await cachedGet('/d', async () => 'ok')).toBe('ok')
  })

  it('forgets everything on clear, including an answer still on its way', async () => {
    let release: (value: string) => void = () => {}
    const slow = cachedGet('/e', () => new Promise<string>((resolve) => (release = resolve)))
    clearApiCache()
    release('old')
    expect(await slow).toBe('old')
    const load = vi.fn(async () => 'new')
    expect(await cachedGet('/e', load)).toBe('new')
    expect(load).toHaveBeenCalledTimes(1)
  })
})
