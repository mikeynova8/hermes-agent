import { describe, expect, it } from 'vitest'

import { friendlyError } from './errors'

describe('friendlyError', () => {
  it('replaces the oversized-session backend exception without exposing counts or config keys', () => {
    const raw = new Error('Session has at least 20001 active messages; max_resume_messages is 20000 in config.yaml')
    const result = friendlyError(raw, 'Could not resume this conversation')

    expect(result).toBe('This chat is too large to continue live. Start a new chat to keep going.')
    expect(result).not.toMatch(/2000|active messages|max_resume_messages|config\.yaml/i)
  })

  it('turns connection internals into calm retry copy', () => {
    expect(friendlyError(new Error('WebSocket connection failed'), 'Could not connect')).toBe(
      'Mikey is reconnecting. Please try again in a moment.'
    )
  })

  it('uses the operation-specific fallback for unknown backend errors', () => {
    expect(friendlyError(new Error('{"jsonrpc":"2.0","error":{"code":-32603}}'), 'Could not load projects')).toBe(
      'Could not load projects'
    )
  })
})
