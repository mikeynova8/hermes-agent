import { Capacitor, registerPlugin } from '@capacitor/core'
import type { AmbientActivityPayload } from './presets'

interface ActivityAvailability {
  available: boolean
  enabled: boolean
}

interface ActivityResult {
  activityID: string
}

interface MikeyActivityPlugin {
  isAvailable(): Promise<ActivityAvailability>
  start(options: AmbientActivityPayload): Promise<ActivityResult>
  update(options: AmbientActivityPayload & { activityID?: string }): Promise<ActivityResult>
  end(options: AmbientActivityPayload & { activityID?: string; immediate?: boolean }): Promise<ActivityResult>
}

const nativePlugin = registerPlugin<MikeyActivityPlugin>('MikeyActivity')

export async function activityAvailability(): Promise<ActivityAvailability> {
  if (!Capacitor.isNativePlatform()) return { available: false, enabled: false }
  return nativePlugin.isAvailable()
}

export async function startActivity(payload: AmbientActivityPayload): Promise<ActivityResult> {
  if (!Capacitor.isNativePlatform()) throw new Error('Live Activities require the Mikey iPhone app')
  return nativePlugin.start(payload)
}

export async function updateActivity(payload: AmbientActivityPayload, activityID?: string): Promise<ActivityResult> {
  if (!Capacitor.isNativePlatform()) throw new Error('Live Activities require the Mikey iPhone app')
  return nativePlugin.update({ ...payload, activityID })
}

export async function endActivity(payload: AmbientActivityPayload, activityID?: string): Promise<ActivityResult> {
  if (!Capacitor.isNativePlatform()) throw new Error('Live Activities require the Mikey iPhone app')
  return nativePlugin.end({ ...payload, activityID, immediate: true })
}
