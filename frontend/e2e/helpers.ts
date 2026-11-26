import type { APIRequestContext, Page } from '@playwright/test'

/** Puts the mock API back into a known state. Call at the start of every test. */
export async function resetApi(
  request: APIRequestContext,
  options: { onboarded: boolean; salaryConfirmed?: boolean } = { onboarded: true },
) {
  const response = await request.post('http://localhost:8080/__reset', { data: options })
  if (!response.ok()) throw new Error(`Mock API reset failed: ${response.status()}`)
}

/** Phones keep the income card and the charts behind "More details" on the dashboard. */
export async function openMoreDetails(page: Page) {
  const details = page.locator('details.more-details')
  if (!(await details.evaluate((d: HTMLDetailsElement) => d.open))) await details.locator(':scope > summary').click()
}
