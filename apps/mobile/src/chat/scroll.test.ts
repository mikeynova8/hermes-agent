import { describe, expect, it } from 'vitest'

import { distanceFromBottom, isNearBottom, NEAR_BOTTOM_THRESHOLD } from './scroll'

describe('timeline scroll state', () => {
  it('identifies a newly loaded long transcript as far from the bottom', () => {
    expect(distanceFromBottom(12_000, 0, 800)).toBe(11_200)
    expect(isNearBottom(12_000, 0, 800)).toBe(false)
  })

  it('keeps live output sticky within the bottom threshold', () => {
    expect(isNearBottom(12_000, 12_000 - 800 - NEAR_BOTTOM_THRESHOLD, 800)).toBe(true)
  })

  it('does not consider an intentional upward scroll near the end as bottom-following', () => {
    expect(isNearBottom(12_000, 12_000 - 800 - NEAR_BOTTOM_THRESHOLD - 1, 800)).toBe(false)
  })

  it('clamps overscroll to zero distance', () => {
    expect(distanceFromBottom(500, 0, 800)).toBe(0)
    expect(isNearBottom(500, 0, 800)).toBe(true)
  })
})
