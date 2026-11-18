import type { APIRequestContext } from '@playwright/test'

/** Puts the mock API back into a known state. Call at the start of every test. */
export async function resetApi(
  request: APIRequestContext,
  options: { onboarded: boolean; salaryConfirmed?: boolean } = { onboarded: true },
) {
  const response = await request.post('http://localhost:8080/__reset', { data: options })
  if (!response.ok()) throw new Error(`Mock API reset failed: ${response.status()}`)
}
