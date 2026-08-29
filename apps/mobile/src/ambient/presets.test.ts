import { describe, expect, it } from 'vitest'
import { ambientPresets } from './presets'

describe('ambientPresets', () => {
  it('creates safe bounded templates rather than arbitrary lock-screen UI', () => {
    const base = 1_800_000_000_000
    const presets = ambientPresets(() => base)

    expect(presets.map(item => item.id)).toEqual(['leave-by', 'agent-progress', 'open-evening'])
    expect(presets[0].payload.targetDate).toBe(base + 24 * 60 * 1_000)
    expect(presets[1].payload.progress).toBe(0.6)
    expect(presets.every(item => item.payload.contextID && item.payload.title && item.payload.symbolName)).toBe(true)
    expect(JSON.stringify(presets)).not.toMatch(/door code|unlock|password|token/i)
  })
})
