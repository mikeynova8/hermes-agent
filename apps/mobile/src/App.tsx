import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDown as ScrollDownIcon,
  ArrowUp as SendIcon,
  Bot as BotIcon,
  ChevronDown as ChevronIcon,
  ChevronLeft as BackIcon,
  FilePlus2 as ActivityIcon,
  Folder as FolderIcon,
  Menu as MenuIcon,
  MessageSquare as ChatsIcon,
  Plus as PlusIcon,
  SquarePen as ComposeIcon
} from 'lucide-react'

import {
  JsonRpcGatewayClient,
  type ConnectionState,
  type GatewayEvent
} from '../../shared/src/json-rpc-gateway'
import {
  botColor,
  botDescription,
  botDisplayName,
  botAppearance,
  canonicalBotSession,
  loadBots,
  pinBotChat,
  type BotProfile
} from './bots/api'
import { dateLabel, formatTime, sameCalendarDay, transcriptMessages } from './chat/format'
import { friendlyError } from './chat/errors'
import { reduceGatewayEvent } from './chat/event-reducer'
import { newSessionParams } from './chat/session-create'
import { isNearBottom } from './chat/scroll'
import { EMPTY_THREAD, type ThreadState } from './chat/types'
import {
  createProject,
  loadProjects,
  loadProjectSessions,
  type ProjectSession,
  type ProjectTreeNode
} from './projects/api'
import { hermesWsUrl } from './transport/auth'
import { listSessions, loadSessionMessages, type SessionInfo, type TranscriptMessage } from './transport/session-api'

interface ResumeResult {
  session_id: string
  session_key?: string
  resumed?: string
  messages?: TranscriptMessage[]
}

interface CreateResult {
  session_id: string
  stored_session_id?: string
  messages?: TranscriptMessage[]
}

type DrawerMode = 'chats' | 'bots'

function sessionTitle(session: SessionInfo): string {
  return session.title?.trim() || session.preview?.trim() || 'New conversation'
}

function BotAvatar({ bot }: { bot: BotProfile }) {
  return (
    <span className="bot-avatar" style={{ background: botColor(bot) }} aria-hidden="true">
      {botDisplayName(bot).slice(0, 1).toUpperCase()}
    </span>
  )
}

function activitySummary(thread: ThreadState) {
  if (thread.activities.length === 0) return null
  const started = Math.min(...thread.activities.map(activity => activity.startedAt))
  const ended = Math.max(...thread.activities.map(activity => activity.completedAt ?? Date.now()))
  const duration = Math.max(1, Math.round((ended - started) / 1000))
  const fileLike = thread.activities.filter(activity => /file|read|write|patch|search/i.test(activity.name)).length
  const count = thread.activities.length
  const label = fileLike === count ? `Worked with ${count} ${count === 1 ? 'file' : 'files'}` : `Used ${count} ${count === 1 ? 'tool' : 'tools'}`
  return { duration, label }
}

export function App() {
  const [sessions, setSessions] = useState<SessionInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [thread, setThread] = useState<ThreadState>(EMPTY_THREAD)
  const [connection, setConnection] = useState<ConnectionState>('idle')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerMode, setDrawerMode] = useState<DrawerMode>('chats')
  const [query, setQuery] = useState('')
  const [bots, setBots] = useState<BotProfile[]>([])
  const [botsLoading, setBotsLoading] = useState(false)
  const [activeBot, setActiveBot] = useState<BotProfile | null>(null)
  const [projectTree, setProjectTree] = useState<ProjectTreeNode[]>([])
  const [projectScope, setProjectScope] = useState<ProjectTreeNode | null>(null)
  const [projectSessions, setProjectSessions] = useState<ProjectSession[]>([])
  const [projectLoading, setProjectLoading] = useState(false)
  const [projectSheetOpen, setProjectSheetOpen] = useState(false)
  const [projectName, setProjectName] = useState('')
  const [projectPath, setProjectPath] = useState('')
  const [projectSaving, setProjectSaving] = useState(false)
  const [draft, setDraft] = useState('')
  const [attachments, setAttachments] = useState<File[]>([])
  const [error, setError] = useState<string | null>(null)
  const [showScrollDown, setShowScrollDown] = useState(false)

  const gatewayRef = useRef<JsonRpcGatewayClient | null>(null)
  const selectedRef = useRef<string | null>(null)
  const reconnectTimerRef = useRef<number | null>(null)
  const reconnectAttemptRef = useRef(0)
  const resumeInFlightRef = useRef<string | null>(null)
  const timelineRef = useRef<HTMLDivElement | null>(null)
  const followBottomRef = useRef(true)
  const forceBottomRef = useRef(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  selectedRef.current = selectedId

  const loadIndex = useCallback(async () => {
    const result = await listSessions()
    setSessions(result.sessions)
    return result.sessions
  }, [])

  const refreshProjects = useCallback(async () => {
    const gateway = gatewayRef.current
    if (!gateway || gateway.connectionState !== 'open') return
    const result = await loadProjects(gateway)
    setProjectTree(result.tree)
  }, [])

  const refreshBots = useCallback(async () => {
    const gateway = gatewayRef.current
    if (!gateway || gateway.connectionState !== 'open') return []
    setBotsLoading(true)
    try {
      const roster = await loadBots(gateway)
      const visible = (roster.profiles ?? []).filter(profile => !profile.ui_meta?.['hermes-bots'] || !(profile.ui_meta['hermes-bots'] as { hidden?: boolean }).hidden)
      setBots(visible)
      return visible
    } finally {
      setBotsLoading(false)
    }
  }, [])

  const openProject = async (project: ProjectTreeNode) => {
    const gateway = gatewayRef.current
    if (!gateway || gateway.connectionState !== 'open') return
    setProjectScope(project)
    setQuery('')
    setProjectSessions([])
    setProjectLoading(true)
    try {
      setProjectSessions(await loadProjectSessions(gateway, project.id))
    } catch (cause) {
      setError(friendlyError(cause, 'Could not load this project'))
    } finally {
      setProjectLoading(false)
    }
  }

  const saveProject = async () => {
    const name = projectName.trim()
    const path = projectPath.trim()
    if (!name || !path || projectSaving) return
    const gateway = gatewayRef.current
    if (!gateway || gateway.connectionState !== 'open') return
    setProjectSaving(true)
    setError(null)
    try {
      const created = await createProject(gateway, { name, path })
      await refreshProjects()
      const tree = (await loadProjects(gateway)).tree
      setProjectTree(tree)
      const node = tree.find(project => project.id === created.id)
      if (node) await openProject(node)
      setProjectSheetOpen(false)
      setProjectName('')
      setProjectPath('')
    } catch (cause) {
      setError(friendlyError(cause, 'Could not create project'))
    } finally {
      setProjectSaving(false)
    }
  }

  const resumeSession = useCallback(async (storedId: string, fallback = true, profile?: string) => {
    forceBottomRef.current = true
    followBottomRef.current = true
    setShowScrollDown(false)
    setSelectedId(storedId)
    if (profile) window.localStorage.setItem('mikey.lastBotName', profile)
    else window.localStorage.setItem('mikey.lastSessionId', storedId)
    setDrawerOpen(false)
    setError(null)
    setThread({ ...EMPTY_THREAD, storedId })

    if (fallback) {
      try {
        const history = await loadSessionMessages(storedId, profile)
        setThread({
          ...EMPTY_THREAD,
          storedId,
          messages: transcriptMessages(history.messages)
        })
      } catch (cause) {
        setError(friendlyError(cause, 'Could not load this conversation'))
      }
    }

    const gateway = gatewayRef.current
    if (!gateway || gateway.connectionState !== 'open') return
    if (resumeInFlightRef.current === storedId) return
    resumeInFlightRef.current = storedId

    try {
      const result = await gateway.request<ResumeResult>('session.resume', {
        session_id: storedId,
        cols: 80,
        ...(profile ? { profile } : {}),
        source: 'mikey-ios'
      })
      if (selectedRef.current !== storedId) return
      const resumedMessages = transcriptMessages(result.messages ?? [])
      setThread(current => {
        const history = current.storedId === storedId ? current.messages : []
        const messages = resumedMessages.length
          ? resumedMessages.map(message => {
              const historical = history.find(
                candidate => candidate.role === message.role && candidate.text === message.text
              )
              return historical ? { ...message, timestamp: historical.timestamp } : message
            })
          : history
        return {
          ...EMPTY_THREAD,
          runtimeId: result.session_id,
          storedId: result.session_key ?? result.resumed ?? storedId,
          messages
        }
      })
    } catch (cause) {
      setError(friendlyError(cause, 'Could not resume this conversation'))
    } finally {
      if (resumeInFlightRef.current === storedId) resumeInFlightRef.current = null
    }
  }, [])

  const openBot = useCallback(async (bot: BotProfile) => {
    setActiveBot(bot)
    setDrawerMode('bots')
    setProjectScope(null)
    setProjectSessions([])
    setQuery('')
    setDrawerOpen(false)
    setDraft('')
    setAttachments([])
    setError(null)
    window.localStorage.setItem('mikey.lastBotName', bot.name)

    const target = canonicalBotSession(bot)
    if (!target) {
      selectedRef.current = null
      setSelectedId(null)
      setThread(EMPTY_THREAD)
      return
    }

    selectedRef.current = target
    await resumeSession(target, true, bot.name)
    const gateway = gatewayRef.current
    if (gateway?.connectionState === 'open' && !botAppearance(bot).chat) {
      await pinBotChat(gateway, bot, target).catch(() => undefined)
      await refreshBots().catch(() => undefined)
    }
  }, [refreshBots, resumeSession])

  const connect = useCallback(async () => {
    if (gatewayRef.current?.connectionState === 'connecting' || gatewayRef.current?.connectionState === 'open') return

    const gateway = new JsonRpcGatewayClient({ requestIdPrefix: 'mikey' })
    gatewayRef.current = gateway
    gateway.onState(state => {
      setConnection(state)
      if (state === 'open') {
        reconnectAttemptRef.current = 0
        if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
        reconnectTimerRef.current = null
        return
      }
      if ((state === 'closed' || state === 'error') && gatewayRef.current === gateway) {
        if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
        const delays = [1_000, 2_000, 4_000, 8_000, 15_000]
        const delay = delays[Math.min(reconnectAttemptRef.current++, delays.length - 1)]
        reconnectTimerRef.current = window.setTimeout(() => {
          reconnectTimerRef.current = null
          void connect()
        }, delay)
      }
    })
    gateway.onEvent((event: GatewayEvent) => setThread(current => reduceGatewayEvent(current, event)))

    try {
      await gateway.connect(hermesWsUrl())
      reconnectAttemptRef.current = 0
      setError(null)
    } catch (cause) {
      setError(friendlyError(cause, 'Could not connect to Mikey'))
    }
  }, [resumeSession])

  useEffect(() => {
    let cancelled = false
    void loadIndex()
      .then(async loaded => {
        if (cancelled || loaded.length === 0) return
        const lastSessionId = window.localStorage.getItem('mikey.lastSessionId')
        if (!lastSessionId || !loaded.some(session => session.id === lastSessionId)) return
        selectedRef.current = lastSessionId
        await resumeSession(lastSessionId)
      })
      .catch(cause => setError(friendlyError(cause, 'Could not load conversations')))
    void connect()

    const reconnectNow = () => {
      if (document.visibilityState === 'visible' && gatewayRef.current?.connectionState !== 'open') void connect()
    }
    window.addEventListener('online', reconnectNow)
    document.addEventListener('visibilitychange', reconnectNow)

    return () => {
      cancelled = true
      if (reconnectTimerRef.current) window.clearTimeout(reconnectTimerRef.current)
      window.removeEventListener('online', reconnectNow)
      document.removeEventListener('visibilitychange', reconnectNow)
      const gateway = gatewayRef.current
      gatewayRef.current = null
      gateway?.close()
    }
  }, [connect, loadIndex, resumeSession])

  // Session index loading and WebSocket opening are independent. Reconcile
  // them declaratively so either completion order restores the selected chat.
  useEffect(() => {
    if (connection !== 'open' || !selectedId || thread.runtimeId) return
    void resumeSession(selectedId, true, activeBot?.name)
  }, [activeBot?.name, connection, resumeSession, selectedId, thread.runtimeId])

  useEffect(() => {
    if (connection !== 'open') return
    void refreshProjects().catch(cause =>
      setError(friendlyError(cause, 'Could not load projects'))
    )
    void refreshBots().catch(cause =>
      setError(friendlyError(cause, 'Could not load Bots'))
    )
  }, [connection, refreshBots, refreshProjects])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const node = timelineRef.current
    if (!node) return
    followBottomRef.current = true
    forceBottomRef.current = false
    node.scrollTo({ top: node.scrollHeight, behavior })
    setShowScrollDown(false)
  }, [])

  const updateScrollState = useCallback(() => {
    const node = timelineRef.current
    if (!node) return
    const nearBottom = isNearBottom(node.scrollHeight, node.scrollTop, node.clientHeight)
    followBottomRef.current = nearBottom
    setShowScrollDown(thread.messages.length > 0 && !nearBottom)
  }, [thread.messages.length])

  // Force every selected conversation to its newest message. Two frames let
  // React commit and WKWebView finish laying out even a very long transcript.
  useEffect(() => {
    if (!forceBottomRef.current || thread.messages.length === 0) return
    let secondFrame = 0
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => scrollToBottom('auto'))
    })
    return () => {
      cancelAnimationFrame(firstFrame)
      if (secondFrame) cancelAnimationFrame(secondFrame)
    }
  }, [scrollToBottom, selectedId, thread.messages.length])

  // Follow live output only while the user remains near the bottom. Observing
  // content size also handles wrapping and expanding tool cards after render.
  useEffect(() => {
    const node = timelineRef.current
    if (!node) return
    const content = node.firstElementChild
    const observer = new ResizeObserver(() => {
      if (forceBottomRef.current || followBottomRef.current) scrollToBottom('auto')
      else updateScrollState()
    })
    if (content) observer.observe(content)
    return () => observer.disconnect()
  }, [scrollToBottom, updateScrollState])

  const startNew = () => {
    forceBottomRef.current = false
    followBottomRef.current = true
    setShowScrollDown(false)
    setSelectedId(null)
    selectedRef.current = null
    window.localStorage.removeItem('mikey.lastSessionId')
    window.localStorage.removeItem('mikey.lastBotName')
    setActiveBot(null)
    setDrawerMode('chats')
    setThread(EMPTY_THREAD)
    setDraft('')
    setAttachments([])
    setDrawerOpen(false)
    setError(null)
  }

  const ensureRuntime = async (): Promise<string> => {
    if (thread.runtimeId) return thread.runtimeId
    const gateway = gatewayRef.current
    if (!gateway || gateway.connectionState !== 'open') throw new Error('Mikey is reconnecting')
    const result = await gateway.request<CreateResult>(
      'session.create',
      activeBot
        ? { profile: activeBot.name, title: 'Bot Chat', hidden: true, source: 'mikey-ios' }
        : newSessionParams(projectScope)
    )
    const storedId = result.stored_session_id ?? thread.storedId
    if (activeBot && storedId) {
      await pinBotChat(gateway, activeBot, storedId)
      const nextBot: BotProfile = {
        ...activeBot,
        ui_meta: {
          ...(activeBot.ui_meta ?? {}),
          'hermes-bots': { ...botAppearance(activeBot), chat: storedId }
        }
      }
      setActiveBot(nextBot)
      setBots(current => current.map(bot => bot.name === nextBot.name ? nextBot : bot))
      setSelectedId(storedId)
      selectedRef.current = storedId
      window.localStorage.setItem('mikey.lastBotName', activeBot.name)
    }
    setThread(current => ({
      ...current,
      runtimeId: result.session_id,
      storedId: storedId ?? current.storedId,
      messages: transcriptMessages(result.messages ?? [])
    }))
    return result.session_id
  }

  const fileBase64 = async (file: File) => {
    const bytes = new Uint8Array(await file.arrayBuffer())
    let binary = ''
    const chunk = 0x8000
    for (let index = 0; index < bytes.length; index += chunk) {
      binary += String.fromCharCode(...bytes.subarray(index, index + chunk))
    }
    return btoa(binary)
  }

  const submit = async () => {
    const text = draft.trim()
    if ((!text && attachments.length === 0) || thread.busy) return
    setError(null)

    try {
      const runtimeId = await ensureRuntime()
      const gateway = gatewayRef.current!
      for (const file of attachments) {
        if (!file.type.startsWith('image/')) throw new Error('Build 3 currently supports image attachments only')
        await gateway.request('image.attach_bytes', {
          session_id: runtimeId,
          content_base64: await fileBase64(file),
          filename: file.name
        })
      }

      const submittedAt = Date.now()
      setThread(current => ({
        ...current,
        busy: true,
        messages: [
          ...current.messages,
          { id: `user-${submittedAt}`, role: 'user', text: text || `Attached ${attachments.length} image${attachments.length === 1 ? '' : 's'}`, timestamp: submittedAt }
        ],
        activities: []
      }))
      setDraft('')
      setAttachments([])
      await gateway.request('prompt.submit', { session_id: runtimeId, text: text || 'Please review the attached image.' })
    } catch (cause) {
      setThread(current => ({ ...current, busy: false }))
      setError(friendlyError(cause, 'Message could not be sent'))
    }
  }

  const filteredSessions = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    const source: SessionInfo[] = projectScope ? projectSessions : sessions
    if (!normalized) return source
    return source.filter(session => `${sessionTitle(session)} ${session.preview ?? ''}`.toLowerCase().includes(normalized))
  }, [projectScope, projectSessions, query, sessions])

  const filteredBots = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return bots
    return bots.filter(bot => `${botDisplayName(bot)} ${bot.name} ${botDescription(bot)}`.toLowerCase().includes(normalized))
  }, [bots, query])

  const selectedSession = [...projectSessions, ...sessions].find(session => session.id === selectedId)
  const headerTitle = activeBot ? botDisplayName(activeBot) : selectedSession ? sessionTitle(selectedSession) : projectScope?.label || 'Mikey'
  const visibleProjects = projectTree.filter(project => !project.isNoProject)
  const activity = activitySummary(thread)

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="icon-button" aria-label="Open conversations" onClick={() => setDrawerOpen(true)}>
          <MenuIcon />
        </button>
        <h1>{headerTitle}</h1>
        <button className="icon-button" aria-label="New conversation" onClick={startNew}>
          <ComposeIcon />
        </button>
      </header>

      {connection !== 'open' && (
        <div className={`connection-banner ${connection === 'error' ? 'is-error' : ''}`} role="status">
          {connection === 'error' ? 'Offline — reconnecting…' : 'Connecting…'}
        </div>
      )}
      {error && <button className="error-banner" onClick={() => setError(null)}>{error}</button>}

      <main className="timeline" ref={timelineRef} aria-live="polite" onScroll={updateScrollState}>
        {thread.messages.length === 0 && !thread.busy ? (
          <section className="empty-state">
            {activeBot && <BotAvatar bot={activeBot} />}
            <h2>{activeBot ? `Message ${botDisplayName(activeBot)}` : 'What can I help with?'}</h2>
            {activeBot && <p>{botDescription(activeBot)}</p>}
          </section>
        ) : (
          <div className="message-list">
            {thread.messages.map((message, index) => {
              const previous = thread.messages[index - 1]
              const showDay = !previous || !sameCalendarDay(previous.timestamp, message.timestamp)
              return (
                <div className="message-entry" key={message.id}>
                  {showDay && <div className="date-separator"><span>{dateLabel(message.timestamp)}</span></div>}
                  <article className={`message ${message.role} ${message.error ? 'is-error' : ''}`}>
                    <div className="message-text">{message.text}{message.streaming && <span className="streaming-cursor" />}</div>
                    <time dateTime={new Date(message.timestamp).toISOString()}>{message.streaming ? 'Now' : formatTime(message.timestamp)}</time>
                  </article>
                </div>
              )
            })}
            {activity && (
              <details className="activity-card">
                <summary>
                  <ActivityIcon />
                  <span>{activity.label} · {activity.duration}s</span>
                  <ChevronIcon />
                </summary>
                <div className="activity-detail">
                  {thread.activities.map(item => (
                    <div className="activity-row" key={item.id}>
                      <span>{item.summary}</span>
                      <span>{item.status === 'running' ? 'Working…' : item.status === 'error' ? 'Failed' : 'Done'}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </main>

      {showScrollDown && (
        <button
          className="scroll-down-button"
          aria-label="Scroll to latest message"
          onClick={() => scrollToBottom('smooth')}
        >
          <ScrollDownIcon />
        </button>
      )}

      <footer className="composer-wrap">
        {attachments.length > 0 && (
          <div className="attachment-tray">
            {attachments.map(file => <span key={`${file.name}-${file.size}`}>{file.name}</span>)}
          </div>
        )}
        <div className="composer">
          <button className="composer-button" aria-label="Attach image" onClick={() => fileInputRef.current?.click()}>
            <PlusIcon />
          </button>
          <input
            ref={fileInputRef}
            className="visually-hidden"
            type="file"
            accept="image/*"
            multiple
            onChange={event => setAttachments(Array.from(event.target.files ?? []))}
          />
          <textarea
            aria-label={`Message ${activeBot ? botDisplayName(activeBot) : 'Mikey'}`}
            placeholder={`Message ${activeBot ? botDisplayName(activeBot) : 'Mikey'}`}
            rows={1}
            value={draft}
            onChange={event => setDraft(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void submit()
              }
            }}
          />
          <button
            className="send-button"
            aria-label={thread.busy ? 'Mikey is responding' : 'Send message'}
            disabled={thread.busy || (!draft.trim() && attachments.length === 0) || connection !== 'open'}
            onClick={() => void submit()}
          >
            <SendIcon />
          </button>
        </div>
      </footer>

      <div className={`drawer-layer ${drawerOpen ? 'is-open' : ''}`} aria-hidden={!drawerOpen}>
        <button className="drawer-scrim" aria-label="Close conversations" onClick={() => setDrawerOpen(false)} />
        <aside className="drawer" aria-label="Conversations">
          <div className="drawer-safe-top" />
          <div className="drawer-header">
            {projectScope && drawerMode === 'chats' && (
              <button className="drawer-back" aria-label="All projects" onClick={() => { setProjectScope(null); setProjectSessions([]); setQuery('') }}>
                <BackIcon />
              </button>
            )}
            <h2>{projectScope && drawerMode === 'chats' ? projectScope.label : 'Mikey'}</h2>
            {drawerMode === 'chats' && <button className="small-new-button" onClick={startNew}><ComposeIcon /> New</button>}
          </div>

          {!projectScope && (
            <div className="drawer-mode-tabs" role="tablist" aria-label="Mikey modes">
              <button
                className={drawerMode === 'chats' ? 'is-active' : ''}
                role="tab"
                aria-selected={drawerMode === 'chats'}
                onClick={() => { setDrawerMode('chats'); setQuery('') }}
              >
                <ChatsIcon /> Chats
              </button>
              <button
                className={drawerMode === 'bots' ? 'is-active' : ''}
                role="tab"
                aria-selected={drawerMode === 'bots'}
                onClick={() => { setDrawerMode('bots'); setProjectScope(null); setProjectSessions([]); setQuery('') }}
              >
                <BotIcon /> Bots
              </button>
            </div>
          )}

          <div className="search-wrap">
            <input
              aria-label={drawerMode === 'bots' ? 'Search Bots' : 'Search conversations'}
              placeholder={drawerMode === 'bots' ? 'Search Bots' : 'Search chats'}
              value={query}
              onChange={event => setQuery(event.target.value)}
            />
          </div>

          {drawerMode === 'chats' ? (
            <>
              {!projectScope && !query.trim() && (
                <section className="projects-section">
                  <div className="drawer-section-heading">
                    <span>Projects</span>
                    <button aria-label="Create project" onClick={() => setProjectSheetOpen(true)}><PlusIcon /></button>
                  </div>
                  <div className="project-list">
                    {visibleProjects.map(project => (
                      <button className="project-row" key={project.id} onClick={() => void openProject(project)}>
                        <span className="project-icon" style={project.color ? { color: project.color } : undefined}>
                          {project.icon || <FolderIcon />}
                        </span>
                        <span className="project-copy">
                          <strong>{project.label}</strong>
                          <small>{project.sessionCount} {project.sessionCount === 1 ? 'chat' : 'chats'}</small>
                        </span>
                        <ChevronIcon />
                      </button>
                    ))}
                    {visibleProjects.length === 0 && <p className="projects-empty">Create a project to group chats by workspace.</p>}
                  </div>
                </section>
              )}

              <div className="drawer-section-heading chats-heading">
                <span>{projectScope ? 'Chats' : query.trim() ? 'Results' : 'Recent'}</span>
              </div>
              <nav className="session-list">
                {projectScope && projectLoading && <p className="session-list-status">Loading chats…</p>}
                {filteredSessions.map(session => (
                  <button
                    className={`session-row ${!activeBot && session.id === selectedId ? 'is-selected' : ''}`}
                    key={session.id}
                    onClick={() => { setActiveBot(null); setDrawerMode('chats'); void resumeSession(session.id) }}
                  >
                    <span className="session-row-title">{sessionTitle(session)}</span>
                  </button>
                ))}
              </nav>
            </>
          ) : (
            <section className="bots-section">
              <div className="drawer-section-heading chats-heading">
                <span>Your Bots</span>
                <small>{bots.length}</small>
              </div>
              <nav className="bot-list">
                {botsLoading && bots.length === 0 && <p className="session-list-status">Loading Bots…</p>}
                {filteredBots.map(bot => (
                  <button
                    className={`bot-row ${activeBot?.name === bot.name ? 'is-selected' : ''}`}
                    key={bot.name}
                    onClick={() => void openBot(bot)}
                  >
                    <BotAvatar bot={bot} />
                    <span className="bot-row-copy">
                      <strong>{botDisplayName(bot)}</strong>
                      <small>{botDescription(bot)}</small>
                    </span>
                  </button>
                ))}
                {!botsLoading && filteredBots.length === 0 && <p className="projects-empty">No Bots found.</p>}
              </nav>
            </section>
          )}
        </aside>
      </div>

      <div className={`sheet-layer ${projectSheetOpen ? 'is-open' : ''}`} aria-hidden={!projectSheetOpen}>
        <button className="sheet-scrim" aria-label="Cancel new project" onClick={() => setProjectSheetOpen(false)} />
        <section className="project-sheet" aria-label="New project">
          <div className="sheet-handle" />
          <h2>New project</h2>
          <label>
            <span>Name</span>
            <input autoComplete="off" placeholder="e.g. Stronks" value={projectName} onChange={event => setProjectName(event.target.value)} />
          </label>
          <label>
            <span>Working directory</span>
            <input autoCapitalize="none" autoComplete="off" placeholder="/Users/mikeynova/projects/stronks" value={projectPath} onChange={event => setProjectPath(event.target.value)} />
          </label>
          <div className="profile-row">
            <span>Hermes profile</span>
            <strong>default</strong>
          </div>
          <button className="create-project-button" disabled={!projectName.trim() || !projectPath.trim() || projectSaving} onClick={() => void saveProject()}>
            {projectSaving ? 'Creating…' : 'Create project'}
          </button>
        </section>
      </div>
    </div>
  )
}
