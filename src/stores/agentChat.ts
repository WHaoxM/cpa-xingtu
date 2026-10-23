/**
 * Multi-conversation workspace (Claude / Qoder style).
 *
 * Isolation boundary:
 * - Each thread binds one backend session_id (STM: history / blackboard / summary)
 * - UI tape is per-thread; switching never merges messages
 * - Student MEMORY.md remains shared LTM by design (not chat STM)
 */
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AIMessage, MessagePart } from '@/types'
import { getApiMode } from '@/api/config'
import {
  archiveSession,
  clearAgentSessionId,
  createSession,
  deleteSession,
  getAgentSessionId,
  getSessionHistory,
  listSessions,
  setAgentSessionId,
  mapAgentToolCalls,
  type AgentHistoryMessage,
  type AgentSessionListItem,
} from '@/api/agent'
import { useUserStore } from '@/stores/user'

export type AgentConversation = {
  sessionId: string
  title: string
  updatedAt: string
  status: string
  messages: AIMessage[]
  /** Loaded from backend history at least once */
  hydrated: boolean
}

function nowStamp(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 16)
}

function titleFromText(text: string, fallback = '新对话'): string {
  const t = (text || '').trim().replace(/\s+/g, ' ')
  if (!t) return fallback
  return t.length > 28 ? `${t.slice(0, 28)}…` : t
}

function normalizeHistoryParts(row: AgentHistoryMessage): MessagePart[] | undefined {
  const parts = row.parts || row.metadata?.parts_v1
  if (Array.isArray(parts) && parts.length) return parts
  if (row.content) return [{ type: 'text', text: String(row.content) }]
  return undefined
}

function mapHistoryToMessages(rows: AgentHistoryMessage[]): AIMessage[] {
  return rows
    .filter(r => r.role === 'user' || r.role === 'assistant')
    .map((r, i) => {
      const timestamp = r.timestamp || r.created_at
      const toolCalls = mapAgentToolCalls(r.tool_calls || r.metadata?.tool_calls)
      const upgradeHint = r.metadata?.upgrade_hint
      return {
        id: r.id || r.message_id || `hist_${i}_${String(timestamp || i)}`,
        role: r.role as 'user' | 'assistant',
        content: String(r.content || ''),
        timestamp: timestamp
          ? String(timestamp).replace('T', ' ').substring(0, 16)
          : nowStamp(),
        status: 'done' as const,
        toolCalls: toolCalls.length ? toolCalls : undefined,
        parts: normalizeHistoryParts(r),
        artifacts: r.artifacts || r.metadata?.artifacts,
        turnId: r.turn_id || r.metadata?.turn_id,
        outcome: r.outcome || r.metadata?.outcome,
        interactionMode: r.interaction_mode || r.metadata?.interaction_mode,
        upgradeHint,
      }
    })
}

function resolveUserId(): string {
  const user = useUserStore()
  return user.currentUser?.id || (getApiMode() === 'http' ? '' : 'demo_student')
}

export const useAgentChatStore = defineStore(
  'agentChat',
  () => {
    const conversations = ref<AgentConversation[]>([])
    const activeSessionId = ref<string | null>(null)
    const bootstrapped = ref(false)
    const switching = ref(false)
    const sessionListError = ref('')
    const historyError = ref('')
    const userScopeId = ref<string | null>(null)

    const activeConversation = computed(() =>
      conversations.value.find(c => c.sessionId === activeSessionId.value) || null,
    )

    const messages = computed<AIMessage[]>(() => activeConversation.value?.messages ?? [])

    const sidebarItems = computed(() =>
      [...conversations.value]
        .filter(c => c.status !== 'archived' || c.messages.some(m => m.role === 'user'))
        .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)),
    )

    function touchConversation(sessionId: string, patch?: Partial<AgentConversation>) {
      const idx = conversations.value.findIndex(c => c.sessionId === sessionId)
      if (idx < 0) return
      const cur = conversations.value[idx]!
      conversations.value[idx] = {
        ...cur,
        ...patch,
        updatedAt: patch?.updatedAt || new Date().toISOString(),
      }
    }

    function upsertMeta(item: AgentSessionListItem, messages: AIMessage[] = [], hydrated = false) {
      const sid = item.session_id
      if (!sid) return
      const existing = conversations.value.find(c => c.sessionId === sid)
      const title = item.title || existing?.title || '新对话'
      const next: AgentConversation = {
        sessionId: sid,
        title,
        updatedAt: item.updated_at || existing?.updatedAt || new Date().toISOString(),
        status: item.status || existing?.status || 'active',
        messages: messages.length ? messages : (existing?.messages ?? []),
        hydrated: hydrated || existing?.hydrated || false,
      }
      if (existing) {
        Object.assign(existing, {
          title: next.title,
          updatedAt: next.updatedAt,
          status: next.status,
          messages: messages.length ? messages : existing.messages,
          hydrated: next.hydrated,
        })
      } else {
        conversations.value.unshift(next)
      }
    }

    async function refreshSessionList(): Promise<boolean> {
      if (getApiMode() !== 'http') return true
      const ownerId = resolveUserId()
      if (!ownerId) {
        sessionListError.value = '登录状态已失效，请重新登录后查看历史对话。'
        return false
      }
      try {
        const rows = await listSessions(ownerId, 40)
        const serverIds = new Set(rows.map(row => row.session_id).filter(Boolean))
        conversations.value = conversations.value.filter(c => serverIds.has(c.sessionId))
        if (activeSessionId.value && !serverIds.has(activeSessionId.value)) {
          activeSessionId.value = null
          clearAgentSessionId()
        }
        for (const row of rows) {
          if (!row.session_id) continue
          upsertMeta(row)
        }
        sessionListError.value = ''
        return true
      } catch (e) {
        console.warn('[agentChat] listSessions failed', e)
        sessionListError.value = e instanceof Error ? e.message : '历史对话列表暂时无法读取。'
        return false
      }
    }

    async function hydrateSession(sessionId: string): Promise<void> {
      const conv = conversations.value.find(c => c.sessionId === sessionId)
      if (!conv || conv.hydrated) return
      if (getApiMode() !== 'http') {
        conv.hydrated = true
        return
      }
      historyError.value = ''
      try {
        const hist = await getSessionHistory(sessionId, 80)
        conv.messages = mapHistoryToMessages(hist)
        conv.hydrated = true
        if (!conv.title || conv.title === '新对话') {
          const firstUser = conv.messages.find(m => m.role === 'user')
          if (firstUser) conv.title = titleFromText(firstUser.content)
        }
      } catch (e) {
        console.warn('[agentChat] hydrate failed', e)
        historyError.value = e instanceof Error ? e.message : '这段对话暂时无法读取，请重试。'
      }
    }

    async function switchSession(sessionId: string): Promise<void> {
      if (!sessionId) return
      if (sessionId === activeSessionId.value) {
        if (getApiMode() === 'http') await hydrateSession(sessionId)
        return
      }
      switching.value = true
      try {
        historyError.value = ''
        setAgentSessionId(sessionId)
        activeSessionId.value = sessionId
        if (!conversations.value.some(c => c.sessionId === sessionId)) {
          upsertMeta({ session_id: sessionId, title: '对话', status: 'active' })
        }
        await hydrateSession(sessionId)
      } finally {
        switching.value = false
      }
    }

    async function startNewConversation(opts?: { archivePrevious?: boolean }): Promise<string | null> {
      if (getApiMode() === 'http' && (!resolveUserId() || sessionListError.value)) return null
      const prev = activeSessionId.value
      const prevConv = activeConversation.value
      const hadUser = Boolean(prevConv?.messages.some(m => m.role === 'user'))

      // New backend session → empty STM (history/blackboard/summary). Do not reuse prev id.
      clearAgentSessionId()
      try {
        const created = await createSession(resolveUserId())
        const sid = created.session_id
        if (!sid) return null
        setAgentSessionId(sid)
        upsertMeta(
          {
            session_id: sid,
            title: '新对话',
            status: 'active',
            updated_at: new Date().toISOString(),
            message_count: 0,
          },
          [],
          true,
        )
        activeSessionId.value = sid

        // Optional archive: default keep previous thread switchable (Claude/Qoder style)
        if (opts?.archivePrevious === true && prev && hadUser && prev !== sid) {
          archiveSession(prev).then(() => {
            touchConversation(prev, { status: 'archived' })
          }).catch(() => {})
        }
        return sid
      } catch (e) {
        console.warn('[agentChat] startNewConversation failed', e)
        return null
      }
    }

    async function ensureActiveSession(): Promise<string> {
      if (getApiMode() === 'http' && (!resolveUserId() || sessionListError.value)) {
        throw new Error(sessionListError.value || '登录状态已失效，请重新登录后继续。')
      }
      const current = activeSessionId.value || getAgentSessionId()
      if (current) {
        const conv = conversations.value.find(c => c.sessionId === current)
        if (getApiMode() === 'http' && conv && !conv.hydrated) {
          await hydrateSession(current)
          if (!conv.hydrated) throw new Error(historyError.value || '历史对话暂时无法读取，请重试。')
        }
        setAgentSessionId(current)
        activeSessionId.value = current
        if (!conversations.value.some(c => c.sessionId === current)) {
          upsertMeta({ session_id: current, title: '对话', status: 'active' }, [], true)
        }
        return current
      }
      const sid = await startNewConversation({ archivePrevious: false })
      if (!sid) throw new Error('无法创建会话')
      return sid
    }

    function addMessage(message: Omit<AIMessage, 'id'> & {id?:string}): AIMessage {
      const sid = activeSessionId.value
      if (!sid) throw new Error('无活跃会话')
      const conv = conversations.value.find(c => c.sessionId === sid)
      if (!conv) throw new Error('会话不存在')
      const row: AIMessage = {
        ...message,
        id: message.id || `ai_msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      }
      conv.messages.push(row)
      conv.updatedAt = new Date().toISOString()
      if (row.role === 'user' && (conv.title === '新对话' || !conv.title)) {
        conv.title = titleFromText(row.content)
      }
      return row
    }

    async function removeConversation(sessionId: string): Promise<void> {
      try {
        await deleteSession(sessionId)
      } catch (e) {
        console.warn('[agentChat] delete failed', e)
      }
      conversations.value = conversations.value.filter(c => c.sessionId !== sessionId)
      if (activeSessionId.value === sessionId) {
        const next = conversations.value.find(c => c.status !== 'archived')
        if (next) await switchSession(next.sessionId)
        else await startNewConversation({ archivePrevious: false })
      }
    }

    async function bootstrap(): Promise<void> {
      if (getApiMode() === 'http') {
        const ownerId = resolveUserId()
        if (!ownerId) {
          sessionListError.value = '登录状态已失效，请重新登录后查看历史对话。'
          bootstrapped.value = false
          return
        }
        if (userScopeId.value !== ownerId) {
          conversations.value = []
          activeSessionId.value = null
          clearAgentSessionId()
          userScopeId.value = ownerId
        }
        // A component remount (including logout and login again) must read the
        // user's current server sessions and transcript instead of trusting a
        // stale in-memory copy.
        for (const conversation of conversations.value) conversation.hydrated = false
        bootstrapped.value = true
        const loaded = await refreshSessionList()
        if (!loaded) {
          bootstrapped.value = false
          return
        }
        const preferred = conversations.value.find(c => c.sessionId === activeSessionId.value)?.sessionId
            // upsertMeta unshifts new rows, so insertion order reverses the
            // server's newest-first list. Restore in the SAME order shown in
            // the sidebar, while preserving an explicitly selected task.
            || sidebarItems.value.find(c => c.status !== 'archived')?.sessionId
        if (preferred) {
          await switchSession(preferred)
          return
        }
        await startNewConversation()
        return
      }

      if (bootstrapped.value) return
      bootstrapped.value = true
      // Restored local tapes are already hydrated; avoid clobbering with empty history fetch
      for (const c of conversations.value) {
        if (c.messages.length > 0) c.hydrated = true
      }
      await startNewConversation()
    }

    return {
      conversations,
      activeSessionId,
      bootstrapped,
      switching,
      sessionListError,
      historyError,
      activeConversation,
      messages,
      sidebarItems,
      bootstrap,
      refreshSessionList,
      switchSession,
      startNewConversation,
      ensureActiveSession,
      addMessage,
      removeConversation,
      hydrateSession,
    }
  },
  {
    // HTTP conversations contain private server history. Keep only demo
    // transcripts in localStorage; authenticated history is reloaded per user.
    persist: getApiMode() === 'mock' ? {
      key: 'agent-chat-store',
      storage: localStorage,
      pick: ['conversations', 'activeSessionId'],
    } : false,
  },
)
