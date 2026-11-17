// The message to show for a failed API response. The API's own message wins; otherwise a
// gateway error (Vercel could not get an answer from Render) means the server is restarting,
// deploying or waking up, which is worth saying instead of a vague "Something went wrong".
const GATEWAY_STATUSES = new Set([502, 503, 504])

export const GATEWAY_MESSAGE = 'The server is restarting or unreachable. Please try again in a minute.'

export function errorMessage(status: number, body: unknown): string {
  if (typeof body === 'object' && body !== null) {
    const message = (body as { message?: unknown }).message
    if (typeof message === 'string' && message.trim() !== '') return message
  }
  return GATEWAY_STATUSES.has(status) ? GATEWAY_MESSAGE : 'Something went wrong'
}
