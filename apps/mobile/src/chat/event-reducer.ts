import type { GatewayEvent } from '../../../shared/src/json-rpc-gateway'
import { friendlyError } from './errors'
import { contentText, timestampMs } from './format'
import type { ThreadState, ToolActivity } from './types'

function payload(event: GatewayEvent): Record<string, unknown> {
  return event.payload && typeof event.payload === 'object' ? (event.payload as Record<string, unknown>) : {}
}

function eventText(data: Record<string, unknown>): string {
  return contentText(data.text ?? data.delta ?? data.content ?? '')
}

function toolId(data: Record<string, unknown>): string {
  return String(data.tool_id ?? data.id ?? data.call_id ?? `tool-${Date.now()}`)
}

function toolName(data: Record<string, unknown>): string {
  return String(data.name ?? data.tool_name ?? data.tool ?? 'Hermes tool')
}

export function reduceGatewayEvent(state: ThreadState, event: GatewayEvent, now = Date.now()): ThreadState {
  if (event.session_id && state.runtimeId && event.session_id !== state.runtimeId) return state

  const data = payload(event)

  switch (event.type) {
    case 'message.start': {
      const id = String(data.message_id ?? `stream-${event.session_id ?? 'current'}`)
      const existing = state.messages.find(message => message.streaming)
      if (existing) return { ...state, busy: true }
      return {
        ...state,
        busy: true,
        messages: [
          ...state.messages,
          { id, role: 'assistant', text: eventText(data), timestamp: timestampMs(data.timestamp, now), streaming: true }
        ]
      }
    }
    case 'message.delta': {
      const delta = eventText(data)
      const index = state.messages.findLastIndex(message => message.streaming)
      if (index < 0) {
        return {
          ...state,
          busy: true,
          messages: [
            ...state.messages,
            { id: `stream-${event.session_id ?? 'current'}`, role: 'assistant', text: delta, timestamp: now, streaming: true }
          ]
        }
      }
      const messages = [...state.messages]
      messages[index] = { ...messages[index], text: `${messages[index].text}${delta}` }
      return { ...state, busy: true, messages }
    }
    case 'message.complete': {
      const complete = eventText(data)
      const index = state.messages.findLastIndex(message => message.streaming)
      if (index < 0) {
        return complete
          ? {
              ...state,
              busy: false,
              messages: [
                ...state.messages,
                { id: `complete-${now}`, role: 'assistant', text: complete, timestamp: timestampMs(data.timestamp, now) }
              ]
            }
          : { ...state, busy: false }
      }
      const messages = [...state.messages]
      messages[index] = {
        ...messages[index],
        text: complete || messages[index].text,
        timestamp: timestampMs(data.timestamp, now),
        streaming: false
      }
      return { ...state, busy: false, messages }
    }
    case 'tool.start': {
      const activity: ToolActivity = {
        id: toolId(data),
        name: toolName(data),
        summary: String(data.description ?? data.label ?? toolName(data)),
        startedAt: now,
        status: 'running'
      }
      return { ...state, activities: [...state.activities.filter(item => item.id !== activity.id), activity] }
    }
    case 'tool.progress':
    case 'tool.generating': {
      const id = toolId(data)
      return {
        ...state,
        activities: state.activities.map(item =>
          item.id === id
            ? { ...item, detail: eventText(data) || item.detail, summary: String(data.description ?? item.summary) }
            : item
        )
      }
    }
    case 'tool.complete': {
      const id = toolId(data)
      const found = state.activities.some(item => item.id === id)
      const complete: ToolActivity = {
        id,
        name: toolName(data),
        summary: String(data.description ?? data.label ?? toolName(data)),
        detail: eventText(data),
        startedAt: now,
        completedAt: now,
        status: data.error ? 'error' : 'complete'
      }
      return {
        ...state,
        activities: found
          ? state.activities.map(item =>
              item.id === id
                ? { ...item, completedAt: now, detail: complete.detail || item.detail, status: complete.status }
                : item
            )
          : [...state.activities, complete]
      }
    }
    case 'error': {
      const raw = eventText(data) || String(data.message ?? '')
      const message = friendlyError(raw, 'Something went wrong. Please try again.')
      return {
        ...state,
        busy: false,
        messages: [
          ...state.messages,
          { id: `error-${now}`, role: 'assistant', text: message, timestamp: now, error: true }
        ]
      }
    }
    default:
      return state
  }
}
