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

export function listSessions(limit = 60): Promise<SessionListResponse> {
  return hermesFetch(`/api/sessions?limit=${limit}&offset=0&order=recent`)
}

export function loadSessionMessages(id: string): Promise<SessionMessagesResponse> {
  return hermesFetch(`/api/sessions/${encodeURIComponent(id)}/messages`)
}
