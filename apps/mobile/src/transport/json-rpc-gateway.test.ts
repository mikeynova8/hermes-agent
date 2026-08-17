import { afterEach, describe, expect, it, vi } from 'vitest'

import { JsonRpcGatewayClient } from '../../../shared/src/json-rpc-gateway'

class AlreadyOpenSocket {
  static OPEN = 1
  static CLOSED = 3
  readyState = AlreadyOpenSocket.OPEN
  addEventListener = vi.fn()
  removeEventListener = vi.fn()
  close = vi.fn()
  send = vi.fn()
}

describe('JsonRpcGatewayClient WebKit lifecycle', () => {
  const originalWebSocket = globalThis.WebSocket

  afterEach(() => {
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: originalWebSocket })
  })

  it('connects when the socket opened before its listener was registered', async () => {
    Object.defineProperty(globalThis, 'WebSocket', { configurable: true, value: AlreadyOpenSocket })
    const socket = new AlreadyOpenSocket()
    const client = new JsonRpcGatewayClient({ socketFactory: () => socket as unknown as WebSocket })

    await expect(client.connect('wss://example.test/api/ws')).resolves.toBeUndefined()
    expect(client.connectionState).toBe('open')
  })
})