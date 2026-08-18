const OVERSIZED_RESUME = /session has at least|active messages.*(?:limit|resume)|max_resume_messages|safe.?resume/i
const CONNECTION_FAILURE = /websocket|networkerror|failed to fetch|network request failed|connection (?:failed|closed)|not connected/i

export function friendlyError(cause: unknown, fallback: string): string {
  const raw = cause instanceof Error ? cause.message : typeof cause === 'string' ? cause : ''

  if (OVERSIZED_RESUME.test(raw)) {
    return 'This chat is too large to continue live. Start a new chat to keep going.'
  }
  if (CONNECTION_FAILURE.test(raw)) {
    return 'Mikey is reconnecting. Please try again in a moment.'
  }
  return fallback
}
