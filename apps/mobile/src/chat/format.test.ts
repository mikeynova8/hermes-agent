import { describe, expect, it } from 'vitest'

import { contentText, dateLabel, sameCalendarDay, timestampMs, transcriptMessages } from './format'

it('extracts text from mixed Hermes content arrays', () => {
  expect(contentText([{ type: 'text', text: 'hello' }, { content: 'world' }])).toBe('hello\nworld')
})

it('normalizes epoch seconds and ISO timestamps', () => {
  expect(timestampMs(1_700_000_000)).toBe(1_700_000_000_000)
  expect(timestampMs('2026-08-17T11:04:00Z')).toBe(Date.parse('2026-08-17T11:04:00Z'))
})

it('keeps only user and assistant transcript messages', () => {
  const messages = transcriptMessages([
    { role: 'system', content: 'secret machinery' },
    { role: 'user', content: 'hello', timestamp: 1_700_000_000 },
    { role: 'assistant', content: 'hey', timestamp: 1_700_000_001 }
  ])
  expect(messages.map(message => message.text)).toEqual(['hello', 'hey'])
})

it('normalizes gateway resume messages that use text instead of content', () => {
  const messages = transcriptMessages([
    { role: 'user', text: 'hello' },
    { role: 'tool' },
    { role: 'assistant', text: 'hey nacho' }
  ])
  expect(messages.map(message => message.text)).toEqual(['hello', 'hey nacho'])
})

describe('chronology', () => {
  const today = Date.parse('2026-08-17T12:00:00Z')
  it('labels same-day and previous-day groups', () => {
    expect(dateLabel(Date.parse('2026-08-17T08:00:00Z'), today)).toBe('Today')
    expect(dateLabel(Date.parse('2026-08-16T08:00:00Z'), today)).toBe('Yesterday')
  })
  it('detects calendar boundaries', () => {
    expect(sameCalendarDay(new Date(2026, 7, 17, 8).getTime(), new Date(2026, 7, 17, 21).getTime())).toBe(true)
    expect(sameCalendarDay(new Date(2026, 7, 17, 23, 59).getTime(), new Date(2026, 7, 18, 0, 1).getTime())).toBe(false)
  })
})
