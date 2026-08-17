import { describe, expect, it } from 'vitest'

import { newSessionParams } from './session-create'

describe('new project chat routing', () => {
  it('inherits the project working directory', () => {
    expect(newSessionParams({ path: '/Users/mikeynova/projects/workout-tracker' })).toEqual({
      cols: 80,
      source: 'mikey-ios',
      cwd: '/Users/mikeynova/projects/workout-tracker'
    })
  })

  it('keeps unfiled chats on the profile default', () => {
    expect(newSessionParams(null)).toEqual({ cols: 80, source: 'mikey-ios' })
  })
})
