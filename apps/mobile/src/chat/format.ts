import type { TranscriptMessage } from '../transport/session-api'
import type { MessageRole, MobileMessage } from './types'

export function contentText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return content == null ? '' : String(content)

  return content
    .map(part => {
      if (typeof part === 'string') return part
      if (!part || typeof part !== 'object') return ''
      const item = part as Record<string, unknown>
      if (typeof item.text === 'string') return item.text
      if (typeof item.content === 'string') return item.content
      return ''
    })
    .filter(Boolean)
    .join('\n')
}

export function timestampMs(value: unknown, fallback = Date.now()): number {
  if (typeof value === 'number') return value < 10_000_000_000 ? value * 1000 : value
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

export function transcriptMessages(messages: TranscriptMessage[]): MobileMessage[] {
  return messages
    .filter(message => message.role === 'user' || message.role === 'assistant')
    .map((message, index) => ({
      id: `history-${index}-${timestampMs(message.timestamp, index)}`,
      role: message.role as MessageRole,
      text: contentText(message.content ?? message.text),
      timestamp: timestampMs(message.timestamp, Date.now() - (messages.length - index) * 1000)
    }))
    .filter(message => message.text.trim().length > 0)
}

export function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

export function dateLabel(timestamp: number, now = Date.now()): string {
  const target = new Date(timestamp)
  const today = new Date(now)
  const startToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const startTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime()
  const days = Math.round((startToday - startTarget) / 86_400_000)

  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' }).format(target)
}

export function sameCalendarDay(a: number, b: number): boolean {
  const left = new Date(a)
  const right = new Date(b)
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  )
}
