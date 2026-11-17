import { describe, expect, it } from 'vitest'
import { scrubUrl } from './monitoring'

describe('scrubUrl', () => {
  it('removes reset tokens from URLs and keeps the rest', () => {
    expect(scrubUrl('https://fifty30.app/reset-password?token=abc.DEF-123')).toBe(
      'https://fifty30.app/reset-password?token=[removed]',
    )
    expect(scrubUrl('/reset-password?x=1&token=secret&y=2')).toBe('/reset-password?x=1&token=[removed]&y=2')
    expect(scrubUrl('/expenses?from=2026-11-01')).toBe('/expenses?from=2026-11-01')
  })
})
