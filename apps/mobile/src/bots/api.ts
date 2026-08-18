import type { JsonRpcGatewayClient } from '../../../shared/src/json-rpc-gateway'

export interface BotSessionSummary {
  id: string
  resolved_id?: string | null
  title?: string | null
  preview?: string | null
  started_at?: string | number | null
  last_active?: string | number | null
  message_count?: number
}

export interface BotAppearance {
  chat?: string | null
  title?: string | null
  description?: string | null
  color?: string | null
  shape?: string | null
  hidden?: boolean
  pinned?: boolean
}

export interface BotProfile {
  name: string
  path?: string
  is_default?: boolean
  model?: string | null
  provider?: string | null
  description?: string | null
  display_name?: string | null
  skill_count?: number
  last_session?: BotSessionSummary | null
  preferred_session?: BotSessionSummary | null
  ui_meta?: Record<string, unknown>
  has_avatar?: boolean
}

export interface BotRoster {
  profiles: BotProfile[]
  bot_mode_protocol?: boolean
}

export function botAppearance(profile: BotProfile): BotAppearance {
  const namespace = profile.ui_meta?.['hermes-bots']
  return namespace && typeof namespace === 'object' ? (namespace as BotAppearance) : {}
}

export function botDisplayName(profile: BotProfile): string {
  const appearance = botAppearance(profile)
  const explicit = appearance.title?.trim() || profile.display_name?.trim()
  if (explicit) return explicit
  if (profile.name === 'default') return 'Mikey'
  return profile.name
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => `${part[0]?.toUpperCase() ?? ''}${part.slice(1)}`)
    .join(' ')
}

export function botDescription(profile: BotProfile): string {
  const appearance = botAppearance(profile)
  return appearance.description?.trim() || profile.description?.trim() || profile.model?.trim() || 'Hermes agent'
}

const INTERNAL_PREVIEW = /\[IMPORTANT:|scheduled cron job|DELIVERY: Your final response|max_resume_messages|active messages|config\.yaml|\[CONTEXT COMPACTION|<memory-context>/i

export function botPreview(profile: BotProfile): string {
  const preview = profile.last_session?.preview?.trim() || ''
  return INTERNAL_PREVIEW.test(preview) ? '' : preview
}

const COLORS = ['#7c6cff', '#20a4a7', '#d1845c', '#5f8fd3', '#aa6eaa', '#709d62', '#c96f82']

export function botColor(profile: BotProfile): string {
  const configured = botAppearance(profile).color?.trim()
  if (configured) return configured
  let hash = 0
  for (const character of profile.name) hash = (hash * 31 + character.charCodeAt(0)) >>> 0
  return COLORS[hash % COLORS.length]
}

export function canonicalBotSession(profile: BotProfile): string | null {
  return botAppearance(profile).chat?.trim() || profile.preferred_session?.resolved_id || profile.preferred_session?.id || profile.last_session?.id || null
}

export async function loadBots(gateway: JsonRpcGatewayClient): Promise<BotRoster> {
  const first = await gateway.request<BotRoster>('profiles.list', { include_sessions: true })
  const preferred: Record<string, string> = {}
  for (const profile of first.profiles ?? []) {
    const pin = botAppearance(profile).chat?.trim()
    if (pin) preferred[profile.name] = pin
  }
  if (Object.keys(preferred).length === 0) return first
  return gateway.request<BotRoster>('profiles.list', {
    include_sessions: true,
    preferred_session_ids: preferred
  })
}

export async function pinBotChat(
  gateway: JsonRpcGatewayClient,
  profile: BotProfile,
  sessionId: string
): Promise<void> {
  await gateway.request('profiles.configure', {
    name: profile.name,
    ui_meta: { 'hermes-bots': { chat: sessionId } }
  })
}
