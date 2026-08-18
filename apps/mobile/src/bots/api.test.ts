import { describe, expect, it, vi } from 'vitest'

import {
  botAppearance,
  botColor,
  botDescription,
  botDisplayName,
  botPreview,
  canonicalBotSession,
  loadBots,
  pinBotChat,
  type BotProfile
} from './api'

function profile(overrides: Partial<BotProfile> = {}): BotProfile {
  return { name: 'researcher', ...overrides }
}

describe('Bot Mode mobile contract', () => {
  it('uses server-synced Hermes Bot metadata for roster presentation', () => {
    const bot = profile({
      description: 'fallback',
      ui_meta: { 'hermes-bots': { title: 'Sage', description: 'Deep research', color: '#123456', chat: 'bot-chat-1' } }
    })
    expect(botDisplayName(bot)).toBe('Sage')
    expect(botDescription(bot)).toBe('Deep research')
    expect(botColor(bot)).toBe('#123456')
    expect(canonicalBotSession(bot)).toBe('bot-chat-1')
  })

  it('presents the default profile as Mikey and gives every bot a stable fallback color', () => {
    expect(botDisplayName(profile({ name: 'default' }))).toBe('Mikey')
    expect(botDisplayName(profile({ name: 'home-helper' }))).toBe('Home Helper')
    expect(botColor(profile())).toBe(botColor(profile()))
  })

  it('adopts the profile latest session when no canonical chat is pinned', () => {
    expect(canonicalBotSession(profile({ last_session: { id: 'latest-1' } }))).toBe('latest-1')
    expect(botAppearance(profile())).toEqual({})
  })

  it('never exposes scheduler, compaction, or backend-error text in roster previews', () => {
    expect(botPreview(profile({ last_session: { id: 'cron', preview: '[IMPORTANT: You are running as a scheduled cron job]' } }))).toBe('')
    expect(botPreview(profile({ last_session: { id: 'chat', preview: 'Finished the household audit' } }))).toBe('Finished the household audit')
  })

  it('resolves canonical pins through the backend and persists new pins in profile metadata', async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({ profiles: [profile({ ui_meta: { 'hermes-bots': { chat: 'root-1' } } })] })
      .mockResolvedValueOnce({ profiles: [profile({ preferred_session: { id: 'root-1', resolved_id: 'tip-2' } })] })
      .mockResolvedValueOnce({ applied: { ui_meta: true } })
    const gateway = { request } as never

    const roster = await loadBots(gateway)
    expect(canonicalBotSession(roster.profiles[0])).toBe('tip-2')
    expect(request).toHaveBeenNthCalledWith(2, 'profiles.list', {
      include_sessions: true,
      preferred_session_ids: { researcher: 'root-1' }
    })

    await pinBotChat(gateway, roster.profiles[0], 'root-3')
    expect(request).toHaveBeenLastCalledWith('profiles.configure', {
      name: 'researcher',
      ui_meta: { 'hermes-bots': { chat: 'root-3' } }
    })
  })
})
