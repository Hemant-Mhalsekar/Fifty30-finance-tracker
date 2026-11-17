import { describe, expect, it } from 'vitest'
import { GATEWAY_MESSAGE, errorMessage } from './errors'

describe('errorMessage', () => {
  it('uses the API message when there is one', () => {
    expect(errorMessage(400, { error: 'Bad Request', message: 'Choose a category' })).toBe('Choose a category')
    // Even on a gateway status: a real app answer is more specific.
    expect(errorMessage(503, { status: 'ok', db: 'down', message: 'Database unavailable' })).toBe('Database unavailable')
  })

  it.each([502, 503, 504])('explains a %d without a message as the server being unreachable', (status) => {
    expect(errorMessage(status, null)).toBe(GATEWAY_MESSAGE)
    expect(errorMessage(status, { status: 'ok', db: 'down' })).toBe(GATEWAY_MESSAGE)
  })

  it('falls back to a generic message otherwise', () => {
    expect(errorMessage(500, null)).toBe('Something went wrong')
    expect(errorMessage(400, { message: '   ' })).toBe('Something went wrong')
  })
})
