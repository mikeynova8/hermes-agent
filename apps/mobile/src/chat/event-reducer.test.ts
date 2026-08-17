import { describe, expect, it } from 'vitest'

import type { GatewayEvent } from '../../../shared/src/json-rpc-gateway'
import { reduceGatewayEvent } from './event-reducer'
import { EMPTY_THREAD } from './types'

const runtime = { ...EMPTY_THREAD, runtimeId: 'runtime-1', storedId: 'stored-1' }

function event(type: string, payload: Record<string, unknown> = {}): GatewayEvent {
  return { type, session_id: 'runtime-1', payload }
}

describe('reduceGatewayEvent', () => {
  it('streams one assistant message and completes it with a timestamp', () => {
    const started = reduceGatewayEvent(runtime, event('message.start'), 1_000)
    const partial = reduceGatewayEvent(started, event('message.delta', { text: 'hey ' }), 1_100)
    const more = reduceGatewayEvent(partial, event('message.delta', { text: 'nacho' }), 1_200)
    const complete = reduceGatewayEvent(more, event('message.complete', { text: 'hey nacho' }), 2_000)

    expect(complete.messages).toHaveLength(1)
    expect(complete.messages[0]).toMatchObject({ role: 'assistant', text: 'hey nacho', timestamp: 2_000 })
    expect(complete.messages[0].streaming).toBe(false)
    expect(complete.busy).toBe(false)
  })

  it('ignores events for another runtime session', () => {
    const other = { ...event('message.delta', { text: 'wrong' }), session_id: 'runtime-2' }
    expect(reduceGatewayEvent(runtime, other, 1_000)).toBe(runtime)
  })

  it('tracks compactable tool activity without exposing it as chat text', () => {
    const started = reduceGatewayEvent(runtime, event('tool.start', { tool_id: 't1', name: 'read_file' }), 1_000)
    const done = reduceGatewayEvent(started, event('tool.complete', { tool_id: 't1', name: 'read_file' }), 5_000)

    expect(done.messages).toHaveLength(0)
    expect(done.activities[0]).toMatchObject({ id: 't1', name: 'read_file', status: 'complete', completedAt: 5_000 })
  })
})
