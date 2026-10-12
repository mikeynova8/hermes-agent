import { registerPlugin } from '@capacitor/core'
import { hermesFetch } from './transport/auth'

export interface ContactResult { id: string; name: string; organization: string; phones: string[]; emails: string[] }
export interface PhoneAuthorization { contacts: string; location: string }
export interface LocationResult { latitude: number; longitude: number; accuracyMeters: number; timestamp: string }

interface MikeyPhoneDataPlugin {
  authorizationStatus(): Promise<PhoneAuthorization>
  searchContacts(options: { query: string; limit?: number }): Promise<{ results: ContactResult[]; limited: boolean }>
  readLocation(): Promise<LocationResult>
}

const NativePhoneData = registerPlugin<MikeyPhoneDataPlugin>('MikeyPhoneData')
const DEVICE_KEY = 'mikey.phone.device-id'
const MAX_QUERY = 64

function deviceId(): string {
  const existing = localStorage.getItem(DEVICE_KEY)
  if (existing) return existing
  const value = crypto.randomUUID()
  localStorage.setItem(DEVICE_KEY, value)
  return value
}

export async function phoneAuthorization(): Promise<PhoneAuthorization> { return NativePhoneData.authorizationStatus() }
export async function searchPhoneContacts(query: string, limit = 10): Promise<{ results: ContactResult[]; limited: boolean }> {
  const normalized = query.trim()
  if (normalized.length < 2 || normalized.length > MAX_QUERY) throw new Error('Contact search requires 2–64 characters')
  return NativePhoneData.searchContacts({ query: normalized, limit: Math.min(Math.max(limit, 1), 10) })
}
export async function readPhoneLocation(): Promise<LocationResult> { return NativePhoneData.readLocation() }

/**
 * Sends only an explicit, bounded result to the selected authenticated session.
 * The phone never uploads a contacts database, uses a background channel, or
 * chooses a session other than the one currently selected by the user.
 */
export async function publishPhoneData(sessionId: string, kind: 'contacts' | 'location', data: unknown): Promise<void> {
  if (!sessionId.trim()) throw new Error('A selected session is required')
  const serialized = JSON.stringify(data)
  if (serialized.length > 12_000) throw new Error('Phone data result exceeds the transport bound')
  const binding = deviceId()
  await hermesFetch(`/api/sessions/${encodeURIComponent(sessionId)}/chat`, {
    method: 'POST',
    headers: {
      'X-Hermes-Session-Id': sessionId,
      'X-Hermes-Device-Id': binding,
      'X-Hermes-Session-Key': `mikey-ios:${binding}`
    },
    body: JSON.stringify({
      message: `[Phone ${kind} result for this selected session; retrieved in foreground with current OS authorization]\n${serialized}`,
      source: 'mikey-ios-phone-data'
    })
  })
}
