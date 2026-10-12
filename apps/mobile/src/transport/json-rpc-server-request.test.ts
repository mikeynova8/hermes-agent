import { describe, expect, it, vi } from 'vitest'
import { JsonRpcGatewayClient } from '../../../shared/src/json-rpc-gateway'

class Socket {
  static OPEN = 1
  readyState = Socket.OPEN
  sent: string[] = []
  listeners = new Map<string, (event: any) => void>()
  addEventListener(type: string, handler: (event: any) => void) { this.listeners.set(type, handler) }
  removeEventListener() {}
  close() {}
  send(value: string) { this.sent.push(value) }
  deliver(value: unknown) { this.listeners.get('message')?.({ data: JSON.stringify(value) }) }
}

describe('server-initiated JSON-RPC requests', () => {
  it('returns a typed result with the same request id', async () => {
    const socket = new Socket()
    const client = new JsonRpcGatewayClient({ socketFactory: () => socket as unknown as WebSocket, requestHandler: async (method, params) => ({ method, status: 'ok', request_id: params.request_id }) })
    await client.connect('wss://example.test/api/ws')
    socket.deliver({ jsonrpc: '2.0', id: 'phone-1', method: 'mikey.phone.request', params: { request_id: 'phone-1', kind: 'location' } })
    await vi.waitFor(() => expect(socket.sent).toHaveLength(1))
    expect(JSON.parse(socket.sent[0])).toMatchObject({ id: 'phone-1', result: { method: 'mikey.phone.request', status: 'ok' } })
  })
})
