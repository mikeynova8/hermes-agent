export interface AmbientActivityPayload {
  contextID: string
  category: string
  title: string
  detail: string
  symbolName: string
  tintHex: string
  progress?: number
  targetDate?: number
  staleDate?: number
}

export interface AmbientPreset {
  id: 'leave-by' | 'agent-progress' | 'open-evening'
  label: string
  description: string
  payload: AmbientActivityPayload
}

const now = () => Date.now()

export function ambientPresets(clock: () => number = now): AmbientPreset[] {
  const current = clock()
  return [
    {
      id: 'leave-by',
      label: 'Leave-by timer',
      description: 'Bike to Poblenou before the rain.',
      payload: {
        contextID: 'demo-leave-by',
        category: 'Leave by',
        title: 'Head out in 24 minutes',
        detail: '17 min by bike · rain starts around 19:00',
        symbolName: 'bicycle',
        tintHex: '67D4FF',
        targetDate: current + 24 * 60 * 1_000,
        staleDate: current + 35 * 60 * 1_000
      }
    },
    {
      id: 'agent-progress',
      label: 'Agent progress',
      description: 'Follow a long-running Hermes task.',
      payload: {
        contextID: 'demo-agent-progress',
        category: 'Working',
        title: 'Preparing TestFlight build',
        detail: 'Running release checks · 3 of 5 complete',
        symbolName: 'hammer.fill',
        tintHex: 'A78BFA',
        progress: 0.6,
        staleDate: current + 30 * 60 * 1_000
      }
    },
    {
      id: 'open-evening',
      label: 'Open evening',
      description: 'A calm window until the next commitment.',
      payload: {
        contextID: 'demo-open-evening',
        category: 'Free time',
        title: '2 hours 10 minutes open',
        detail: 'Next: dinner with Olga at 20:30',
        symbolName: 'moon.stars.fill',
        tintHex: 'F6C453',
        targetDate: current + 130 * 60 * 1_000,
        staleDate: current + 135 * 60 * 1_000
      }
    }
  ]
}
