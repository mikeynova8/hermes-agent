import { afterEach, describe, expect, it, vi } from 'vitest'

import { publishPhoneData } from './phone-data'

const originalFetch = globalThis.fetch
const originalStorage = globalThis.localStorage

afterEach(() => {
  vi.restoreAllMocks()
  Object.defineProperty(globalThis, 'fetch', { configurable: true, value: originalFetch })
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: originalStorage })
})

describe('phone data transport policy', () => {
  it('posts only to the explicitly selected session with a device-scoped key', async () => {
    const values = new Map<string, string>()
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (k: string) => values.get(k) ?? null, setItem: (k: string, v: string) => values.set(k, v) } })
    const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }))
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })

    await publishPhoneData('session-owner-a', 'location', { latitude: 41.4, longitude: 2.1 })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toContain('/api/sessions/session-owner-a/chat')
    expect(init.headers).toMatchObject({
      'X-Hermes-Session-Id': 'session-owner-a'
    })
    expect(init.body).toContain('location')
  })

  it('rejects oversized results before they reach the network', async () => {
    const fetchMock = vi.fn()
    Object.defineProperty(globalThis, 'fetch', { configurable: true, value: fetchMock })
    await expect(publishPhoneData('session-owner-a', 'contacts', { value: 'x'.repeat(12_001) })).rejects.toThrow('transport bound')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects an empty session binding', async () => {
    await expect(publishPhoneData(' ', 'location', {})).rejects.toThrow('selected session')
  })
})
