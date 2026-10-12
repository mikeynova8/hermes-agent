import { registerPlugin } from '@capacitor/core'
import { hermesFetch } from './transport/auth'

export interface ContactResult { id: string; name: string; organization: string; phones: string[]; emails: string[] }
export type LocationAuthorizationState = 'notDetermined' | 'authorizedWhenInUse' | 'authorizedAlways' | 'denied' | 'restricted' | 'unavailable'
export interface PhoneAuthorization { contacts: string; location: LocationAuthorizationState }
export interface LocationResult { latitude: number; longitude: number; accuracyMeters: number; timestamp: string }

interface MikeyPhoneDataPlugin {
  authorizationStatus(): Promise<PhoneAuthorization>
  requestAlwaysAuthorization(): Promise<{ location: LocationAuthorizationState }>
  startBackgroundLocation(): Promise<{ location: LocationAuthorizationState; mode: 'significant-change' }>
  stopBackgroundLocation(): Promise<{ location: LocationAuthorizationState; mode: 'stopped' }>
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
export async function requestAlwaysLocation(): Promise<{ location: LocationAuthorizationState }> { return NativePhoneData.requestAlwaysAuthorization() }
export async function startBackgroundLocation(): Promise<{ location: LocationAuthorizationState; mode: 'significant-change' }> { return NativePhoneData.startBackgroundLocation() }
export async function stopBackgroundLocation(): Promise<{ location: LocationAuthorizationState; mode: 'stopped' }> { return NativePhoneData.stopBackgroundLocation() }
export function canUseBackgroundLocation(status: LocationAuthorizationState): boolean { return status === 'authorizedAlways' }
export async function searchPhoneContacts(query: string, limit = 10): Promise<{ results: ContactResult[]; limited: boolean }> {
  const normalized = query.trim()
  if (normalized.length < 2 || normalized.length > MAX_QUERY) throw new Error('Contact search requires 2–64 characters')
  return NativePhoneData.searchContacts({ query: normalized, limit: Math.min(Math.max(limit, 1), 10) })
}
export async function readPhoneLocation(): Promise<LocationResult> { return NativePhoneData.readLocation() }

export function phoneDataDeviceId(): string { return deviceId() }

/** Execute exactly one gateway-issued, selected-session request. */
export async function handlePhoneDataRequest(params: Record<string, unknown>): Promise<Record<string, unknown>> {
  const sessionId = typeof params.session_id === 'string' ? params.session_id.trim() : ''
  const boundDevice = typeof params.device_id === 'string' ? params.device_id : ''
  const kind = params.kind
  if (!sessionId || boundDevice !== deviceId()) throw new Error('phone_binding_rejected')
  if (kind === 'contacts') {
    const query = typeof params.query === 'string' ? params.query : ''
    const limit = typeof params.limit === 'number' ? params.limit : 10
    try {
      const result = await searchPhoneContacts(query, limit)
      return { request_id: params.request_id, session_id: sessionId, device_id: deviceId(), kind, status: result.limited ? 'limited' : 'ok', result }
    } catch (error) {
      return { request_id: params.request_id, session_id: sessionId, device_id: deviceId(), kind, status: error instanceof Error && /permission/i.test(error.message) ? 'denied' : 'unavailable', error: { code: error instanceof Error ? error.message : 'contacts_unavailable' } }
    }
  }
  if (kind === 'location') {
    try {
      const result = await readPhoneLocation()
      return { request_id: params.request_id, session_id: sessionId, device_id: deviceId(), kind, status: 'ok', result }
    } catch (error) {
      const code = error instanceof Error ? error.message : 'location_unavailable'
      const status = /denied/i.test(code) ? 'denied' : /restricted/i.test(code) ? 'restricted' : /timeout/i.test(code) ? 'timeout' : 'unavailable'
      return { request_id: params.request_id, session_id: sessionId, device_id: deviceId(), kind, status, error: { code } }
    }
  }
  throw new Error('invalid_phone_request')
}

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
