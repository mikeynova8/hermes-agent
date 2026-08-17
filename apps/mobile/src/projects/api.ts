import type { JsonRpcGatewayClient } from '../../../shared/src/json-rpc-gateway'
import type { SessionInfo } from '../transport/session-api'

export interface ProjectFolder {
  path: string
  label: string | null
  is_primary: boolean
}

export interface ProjectInfo {
  id: string
  name: string
  slug: string
  description: string | null
  icon: string | null
  color: string | null
  primary_path: string | null
  archived: boolean
  folders: ProjectFolder[]
}

export interface ProjectSession extends SessionInfo {
  cwd?: string | null
  last_active?: number | null
  started_at?: number | null
}

export interface ProjectLane {
  id: string
  label: string
  path: string
  sessions: ProjectSession[]
}

export interface ProjectRepo {
  id: string
  label: string
  path: string
  groups: ProjectLane[]
}

export interface ProjectTreeNode {
  id: string
  label: string
  path: string | null
  color: string | null
  icon: string | null
  isAuto: boolean
  isNoProject?: boolean
  sessionCount: number
  previewSessions: ProjectSession[]
  repos: ProjectRepo[]
}

interface ProjectsListResult {
  projects: ProjectInfo[]
  active_id: string | null
}

interface ProjectsTreeResult {
  projects: ProjectTreeNode[]
  active_id: string | null
}

export async function loadProjects(gateway: JsonRpcGatewayClient): Promise<{
  explicit: ProjectInfo[]
  tree: ProjectTreeNode[]
}> {
  const [list, tree] = await Promise.all([
    gateway.request<ProjectsListResult>('projects.list'),
    gateway.request<ProjectsTreeResult>('projects.tree', { preview_limit: 3 })
  ])
  return { explicit: list.projects ?? [], tree: tree.projects ?? [] }
}

export async function loadProjectSessions(
  gateway: JsonRpcGatewayClient,
  projectId: string
): Promise<ProjectSession[]> {
  const response = await gateway.request<{ project: ProjectTreeNode | null }>('projects.project_sessions', {
    project_id: projectId
  })
  const project = response.project
  if (!project) return []
  const sessions = project.repos.flatMap(repo => repo.groups.flatMap(group => group.sessions ?? []))
  const seen = new Set<string>()
  return sessions.filter(session => {
    if (!session.id || seen.has(session.id)) return false
    seen.add(session.id)
    return true
  })
}

export async function createProject(
  gateway: JsonRpcGatewayClient,
  input: { name: string; path: string }
): Promise<ProjectInfo> {
  const response = await gateway.request<{ project: ProjectInfo | null }>('projects.create', {
    name: input.name.trim(),
    folders: [{ path: input.path.trim(), label: input.name.trim(), is_primary: true }],
    primary_path: input.path.trim(),
    use: true
  })
  if (!response.project) throw new Error('Hermes did not create the project')
  return response.project
}
