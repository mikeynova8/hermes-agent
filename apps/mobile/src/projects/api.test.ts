import { describe, expect, it, vi } from 'vitest'

import type { JsonRpcGatewayClient } from '../../../shared/src/json-rpc-gateway'
import { createProject, loadProjectSessions } from './api'

function gatewayWith(request: ReturnType<typeof vi.fn>): JsonRpcGatewayClient {
  return { request } as unknown as JsonRpcGatewayClient
}

describe('project sessions', () => {
  it('flattens Hermes repo lanes and removes duplicate sessions', async () => {
    const request = vi.fn().mockResolvedValue({
      project: {
        id: 'booknest',
        label: 'BookNest',
        path: '/Users/mikeynova/projects/booknest',
        color: null,
        icon: null,
        isAuto: true,
        sessionCount: 2,
        previewSessions: [],
        repos: [
          {
            id: 'repo',
            label: 'repo',
            path: '/Users/mikeynova/projects/booknest',
            groups: [
              { id: 'main', label: 'main', path: '/Users/mikeynova/projects/booknest', sessions: [{ id: 'one', title: 'One' }] },
              { id: 'branch', label: 'branch', path: '/tmp/branch', sessions: [{ id: 'one', title: 'One' }, { id: 'two', title: 'Two' }] }
            ]
          }
        ]
      }
    })

    const sessions = await loadProjectSessions(gatewayWith(request), 'booknest')

    expect(request).toHaveBeenCalledWith('projects.project_sessions', { project_id: 'booknest' })
    expect(sessions.map(session => session.id)).toEqual(['one', 'two'])
  })
})

describe('project creation', () => {
  it('persists the primary working directory in Hermes Projects', async () => {
    const request = vi.fn().mockResolvedValue({
      project: {
        id: 'stronks',
        name: 'Stronks',
        slug: 'stronks',
        description: null,
        icon: null,
        color: null,
        primary_path: '/Users/mikeynova/projects/workout-tracker',
        archived: false,
        folders: []
      }
    })

    await createProject(gatewayWith(request), {
      name: ' Stronks ',
      path: ' /Users/mikeynova/projects/workout-tracker '
    })

    expect(request).toHaveBeenCalledWith('projects.create', {
      name: 'Stronks',
      folders: [{ path: '/Users/mikeynova/projects/workout-tracker', label: 'Stronks', is_primary: true }],
      primary_path: '/Users/mikeynova/projects/workout-tracker',
      use: true
    })
  })
})
