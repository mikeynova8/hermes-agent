import { hermesFetch } from './auth'

export interface SessionInfo {
  id: string
  title?: string | null
  preview?: string | null
  source?: string | null
  created_at?: string | number | null
  updated_at?: string | number | null
  last_active_at?: string | number | null
  message_count?: number
  active?: boolean
}

export interface TranscriptMessage {
  role: string
  content?: unknown
  text?: unknown
  timestamp?: string | number | null
  tool_calls?: unknown[]
  tool_name?: string | null
  tool_call_id?: string | null
}

export interface SessionListResponse {
  sessions: SessionInfo[]
  total: number
  limit: number
  offset: number
}

export interface SessionMessagesResponse {
  session_id: string
  messages: TranscriptMessage[]
}

export function isUserVisibleSession(session: SessionInfo): boolean {
  const source = session.source?.trim().toLowerCase() || ''
  return source !== 'cron' && source !== 'subagent' && !source.startsWith('retrieval-')
}

export async function listSessions(limit = 60): Promise<SessionListResponse> {
  // Cron runs and delegated/retrieval workers contain synthetic prompts meant
  // for the agent runtime. Their final output is delivered elsewhere; they are
  // operational logs, not user conversations. Page through the backend's
  // accepted 60-row window until the drawer has enough actual chats.
  const pageSize = 60
  const visible: SessionInfo[] = []
  let offset = 0
  let total = Number.POSITIVE_INFINITY
  let lastPage: SessionListResponse | null = null

  while (visible.length < limit && offset < total && offset < 1_200) {
    const page = await hermesFetch<SessionListResponse>(
      `/api/sessions?limit=${pageSize}&offset=${offset}&order=recent`
    )
    lastPage = page
    total = page.total
    visible.push(...page.sessions.filter(isUserVisibleSession))
    if (page.sessions.length === 0) break
    offset += page.sessions.length
  }

  return {
    ...(lastPage ?? { total: 0, limit, offset: 0 }),
    sessions: visible.slice(0, limit),
    limit,
    offset: 0
  }
}

export function loadSessionMessages(id: string): Promise<SessionMessagesResponse> {
  return hermesFetch(`/api/sessions/${encodeURIComponent(id)}/messages`)
}
