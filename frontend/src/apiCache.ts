// A short-lived memory of GET answers, so going back to a page you just saw shows it at once
// instead of waiting for the server again. Kept in memory only (never in browser storage),
// so it is gone on reload and never outlives the signed-in session.
//
// Any change (a POST, PUT, PATCH or DELETE), a new access token and pull-to-refresh clear it,
// so the app never shows you your own numbers from before a change.

export const CACHE_TTL_MS = 120_000

type Entry = { at: number; value: unknown }

const entries = new Map<string, Entry>()
const inFlight = new Map<string, Promise<unknown>>()
// Bumped on every clear, so an answer that was already on its way is not stored afterwards.
let generation = 0

/**
 * Answers from memory when the same GET succeeded less than CACHE_TTL_MS ago; otherwise loads it,
 * sharing one request between callers that ask at the same time. Failures are never stored.
 * Callers get their own copy, so changing what they received cannot change the cache.
 */
export function cachedGet<T>(key: string, load: () => Promise<T>, now: () => number = Date.now): Promise<T> {
  const hit = entries.get(key)
  if (hit && now() - hit.at < CACHE_TTL_MS) return Promise.resolve(structuredClone(hit.value) as T)

  const running = inFlight.get(key)
  if (running) return running.then((value) => structuredClone(value) as T)

  const startedIn = generation
  const request: Promise<T> = load()
    .then((value) => {
      if (startedIn === generation) entries.set(key, { at: now(), value: structuredClone(value) })
      return value
    })
    .finally(() => {
      if (inFlight.get(key) === request) inFlight.delete(key)
    })
  inFlight.set(key, request)
  return request
}

export function clearApiCache(): void {
  entries.clear()
  inFlight.clear()
  generation++
}
