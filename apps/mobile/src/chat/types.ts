export type MessageRole = 'user' | 'assistant' | 'system'

export interface MobileMessage {
  id: string
  role: MessageRole
  text: string
  timestamp: number
  streaming?: boolean
  error?: boolean
}

export interface ToolActivity {
  id: string
  name: string
  summary: string
  startedAt: number
  completedAt?: number
  status: 'running' | 'complete' | 'error'
  detail?: string
}

export interface ThreadState {
  runtimeId: string | null
  storedId: string | null
  messages: MobileMessage[]
  activities: ToolActivity[]
  busy: boolean
}

export const EMPTY_THREAD: ThreadState = {
  runtimeId: null,
  storedId: null,
  messages: [],
  activities: [],
  busy: false
}
