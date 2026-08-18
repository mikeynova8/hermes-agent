import { describe, expect, it } from 'vitest'

import { isUserVisibleSession, type SessionInfo } from './session-api'

function session(source: string): SessionInfo {
  return { id: `session-${source}`, source }
}

describe('mobile conversation visibility', () => {
  it('keeps interactive conversations visible', () => {
    for (const source of ['telegram', 'cli', 'desktop', 'mikey-ios', 'discord']) {
      expect(isUserVisibleSession(session(source))).toBe(true)
    }
  })

  it('hides cron runs whose user turn is an internal scheduler prompt', () => {
    expect(isUserVisibleSession(session('cron'))).toBe(false)
  })

  it('hides delegated and retrieval worker transcripts', () => {
    expect(isUserVisibleSession(session('subagent'))).toBe(false)
    expect(isUserVisibleSession(session('retrieval-reflex-verification'))).toBe(false)
  })

  it('handles source casing and missing source safely', () => {
    expect(isUserVisibleSession(session(' CRON '))).toBe(false)
    expect(isUserVisibleSession({ id: 'legacy' })).toBe(true)
  })
})
