import { getApiMode } from './config'
import { mockGet, mockMutate } from './adapters/mockAdapter'
import { httpDelete, httpGet, httpPost } from './adapters/httpAdapter'
import type { AIToolCall, ArtifactRef, MessagePart, PublicTurn, TurnOutcome } from '@/types'

export type InteractionMode = 'ask' | 'agent' | 'experts'

export type AgentChatRequest = {
  message: string
  student_id?: string
  session_id?: string | null
  /** Engine: supervisor | langgraph_legacy | react | demo */
  mode?: 'demo' | 'langgraph' | 'react' | 'supervisor' | 'langgraph_legacy'
  /** Qoder-aligned interaction mode */
  interaction_mode?: InteractionMode
  plan_mode?: boolean
  /** Claude/Qoder: reference uploaded file_ids (do not paste file bodies) */
  attachment_ids?: string[]
  content_parts?: Array<Record<string, unknown>>
  voice_turn_id?: string
}

/** Backend tool_calls item (supervisor / langgraph) */
export type AgentToolCallRaw = {
  tool_name?: string
  name?: string
  tool?: string
  parameters?: Record<string, unknown>
  result_preview?: string
  summary?: string
  result?: string
  status?: string
  artifact_refs?: ArtifactRef[]
  elapsed_seconds?: number
}

export type AgentUpgradeHint = {
  to: InteractionMode | string
  reason?: string
}

export type AgentPermissionDenial = {
  tool?: string
  reason?: string
}

export type AgentChatData = PublicTurn & {
  reply: string
  tool_calls?: AgentToolCallRaw[] | unknown[]
  /** ReAct 等引擎返回的中间思考步骤 */
  thinking_steps?: string[]
  session_id?: string
  elapsed_seconds?: number
  engine?: string
  active_subagent?: string
  interaction_mode?: InteractionMode | string
  upgrade_hint?: AgentUpgradeHint
  fork_jobs_enqueued?: string[]
  permission_denials?: AgentPermissionDenial[]
  orchestration?: {
    active_subagent?: string
    strategy?: string
    interaction_mode?: string
    upgrade_hint?: AgentUpgradeHint
    permission_denials?: AgentPermissionDenial[]
    thinking_steps?: string[]
  }
}

export type AgentSessionCreateData = {
  session_id: string
  created_at?: string
}

/** Owner-scoped artifact index. The full business payload may live in a domain store. */
export type AgentArtifactDetail = ArtifactRef & {
  resource_type?: string
  resource_id?: string
  session_id?: string
  turn_id?: string
  content?: { body: string; status: string }
}

export async function getAgentArtifact(artifactId: string): Promise<AgentArtifactDetail | null> {
  if (getApiMode() === 'mock') return null
  const env = await httpGet<AgentArtifactDetail>(`/api/agent/artifacts/${encodeURIComponent(artifactId)}`)
  return env.data ?? null
}


export type AgentHistoryMessage = {
  id?: string
  message_id?: string
  turn_id?: string
  role: string
  content: string
  timestamp?: string
  created_at?: string
  parts?: MessagePart[]
  artifacts?: ArtifactRef[]
  interaction_mode?: InteractionMode | string
  outcome?: TurnOutcome
  tool_calls?: AgentToolCallRaw[]
  metadata?: {
    tool_calls?: AgentToolCallRaw[]
    parts_v1?: MessagePart[]
    artifacts?: ArtifactRef[]
    turn_id?: string
    interaction_mode?: InteractionMode | string
    outcome?: TurnOutcome
    upgrade_hint?: AgentUpgradeHint
    orchestration?: Record<string, unknown>
  }
}

export type AgentSessionListItem = {
  session_id: string
  student_id?: string
  status?: string
  title?: string
  preview?: string
  created_at?: string
  updated_at?: string
  message_count?: number
}

function stringifyArgs(parameters?: Record<string, unknown>): Record<string, string> | undefined {
  if (!parameters || typeof parameters !== 'object') return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parameters)) {
    if (v == null) continue
    out[k] = typeof v === 'string' ? v : JSON.stringify(v)
  }
  return Object.keys(out).length ? out : undefined
}

function extractTaskId(parameters?: Record<string, unknown>, preview?: string): string | undefined {
  if (parameters) {
    const raw = parameters.task_id ?? parameters.taskId
    if (typeof raw === 'string' && raw.trim()) return raw.trim()
  }
  if (preview) {
    const m = preview.match(/task[_-]?id["']?\s*[:=]\s*["']?([a-zA-Z0-9_-]+)/i)
    if (m?.[1]) return m[1]
  }
  return undefined
}

const SENSITIVE_ARG_KEYS = new Set([
  'phone', 'email', 'mobile', 'tel', 'password', 'secret', 'token',
  'profile_json', 'posting_json', 'raw_text', 'resume_text',
])

function publicArgs(parameters?: Record<string, unknown>): Record<string, string> | undefined {
  if (!parameters || typeof parameters !== 'object') return undefined
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(parameters)) {
    if (v == null) continue
    const lk = k.toLowerCase()
    if (SENSITIVE_ARG_KEYS.has(lk) || lk.endsWith('_json') || lk.endsWith('_token')) {
      out[k] = '[redacted]'
      continue
    }
    const s = typeof v === 'string' ? v : JSON.stringify(v)
    out[k] = s.length > 80 ? `${s.slice(0, 77)}…` : s
  }
  return Object.keys(out).length ? out : undefined
}

/** Map backend tool_calls → UI cards (defense-in-depth; prefer backend egress). */
export function mapAgentToolCalls(raw: unknown): AIToolCall[] {
  if (!Array.isArray(raw)) return []
  return raw.map((item, idx) => {
    const row = (item && typeof item === 'object') ? item as AgentToolCallRaw : {}
    const name = String(row.tool_name || row.name || row.tool || `tool_${idx + 1}`)
    // Prefer summary; never surface long raw dumps as primary text
    const summary = String(row.summary || row.result_preview || '已完成调用').slice(0, 160)
    const args = publicArgs(row.parameters) || stringifyArgs(row.parameters)
    const taskId = extractTaskId(row.parameters, summary)
    const rawStatus = String(row.status || '').toLowerCase()
    const status: AIToolCall['status'] =
      ['done', 'completed', 'success'].includes(rawStatus) ? 'done'
        : ['failed', 'error', 'denied'].includes(rawStatus) ? 'error'
          : ['running', 'queued', 'pending'].includes(rawStatus) ? 'running'
            : ['needs_input', 'approval_required'].includes(rawStatus) ? 'needs_input'
              : rawStatus === 'partial' ? 'partial'
            : 'unknown'
    return {
      name,
      status,
      summary,
      args,
      // Do not mirror raw DB bodies into expandable preview
      resultPreview: undefined,
      parameters: undefined,
      taskId,
    }
  })
}

export function publicTurnToMessageParts(turn: AgentChatData): MessagePart[] {
  if (Array.isArray(turn.parts) && turn.parts.length) return turn.parts
  const parts: MessagePart[] = []
  const progress = turn.orchestration && typeof turn.orchestration === 'object'
    ? (turn.orchestration as { progress?: Record<string, unknown> }).progress
    : undefined
  if (progress && typeof progress === 'object') {
    parts.push({
      type: 'progress',
      status: 'done',
      title: '本轮进度',
      progress,
    })
  }
  for (const tool of mapAgentToolCalls(turn.tool_calls)) {
    parts.push({ type: 'tool_call', status: tool.status, tool_call: tool })
  }
  for (const artifact of turn.artifacts || []) {
    parts.push({ type: 'artifact_ref', artifact })
  }
  if (turn.reply) parts.push({ type: 'text', text: turn.reply })
  const hint = turn.upgrade_hint || (turn.orchestration as { upgrade_hint?: AgentUpgradeHint } | undefined)?.upgrade_hint
  if (hint?.to) parts.push({ type: 'upgrade_hint', to: hint.to, reason: hint.reason })
  return parts
}

let agentSessionId: string | null = null

export function getAgentSessionId(): string | null {
  return agentSessionId
}

export function setAgentSessionId(id: string | null) {
  agentSessionId = id
}

export function clearAgentSessionId() {
  agentSessionId = null
}

type DemoReplyCatalog = {
  default?: AgentChatData
  scenarios?: Array<{
    keywords?: string[]
    reply?: string
    tool_calls?: AgentToolCallRaw[]
    thinking_steps?: string[]
    artifacts?: ArtifactRef[]
    active_subagent?: string
  }>
}

async function resolveMockChat(message: string, sessionId: string | null): Promise<AgentChatData> {
  let catalog: DemoReplyCatalog = {}
  try {
    const env = await mockGet<DemoReplyCatalog>('agent/replies.json')
    catalog = (env.data ?? {}) as DemoReplyCatalog
  } catch {
    try {
      const env = await mockGet<AgentChatData>('agent/chat.demo.json')
      catalog = { default: (env.data ?? {}) as AgentChatData }
    } catch {
      catalog = {}
    }
  }

  const text = String(message || '').toLowerCase()
  const hit = (catalog.scenarios ?? []).find(s =>
    (s.keywords ?? []).some(k => k && text.includes(String(k).toLowerCase())),
  )

  const base = (catalog.default ?? {}) as AgentChatData
  const sid = base.session_id || sessionId || `demo_${Date.now().toString(36)}`
  agentSessionId = sid

  if (!hit) {
    return {
      ...base,
      reply: base.reply || '演示模式已接收你的问题。当前为 Mock，不请求后端。',
      session_id: sid,
      engine: base.engine || 'demo',
    }
  }

  return {
    ...base,
    reply: hit.reply || base.reply || '演示模式已接收你的问题。',
    tool_calls: hit.tool_calls ?? base.tool_calls,
    thinking_steps: hit.thinking_steps ?? base.thinking_steps,
    artifacts: hit.artifacts ?? base.artifacts,
    active_subagent: hit.active_subagent || base.active_subagent || 'demo_guide',
    session_id: sid,
    engine: 'demo',
    elapsed_seconds: 0.5 + Math.random() * 0.6,
  }
}

export async function chat(req: AgentChatRequest): Promise<AgentChatData> {
  // http 默认真引擎；仅 mock / 显式传 demo 才走演示回复
  const mode = req.mode ?? (getApiMode() === 'http' ? 'langgraph' : 'demo')
  const sessionId = req.session_id !== undefined ? req.session_id : agentSessionId

  if (getApiMode() === 'mock') {
    return resolveMockChat(req.message, sessionId ?? null)
  }

  const env = await httpPost<AgentChatData>('/api/agent/chat', {
    message: req.message,
    student_id: req.student_id,
    session_id: sessionId ?? undefined,
    mode,
    interaction_mode: req.interaction_mode ?? 'ask',
    plan_mode: req.plan_mode,
    attachment_ids: req.attachment_ids,
    content_parts: req.content_parts,
    voice_turn_id: req.voice_turn_id,
  })
  const data = (env.data ?? { reply: '' }) as AgentChatData
  if (data.session_id) agentSessionId = data.session_id
  return data
}

export async function createSession(studentId?: string): Promise<AgentSessionCreateData> {
  if (getApiMode() === 'mock') {
    const env = await mockMutate<AgentSessionCreateData>('agent/session.create.json')
    // The fixture has a fixed session_id; a new task must not reuse the previous local transcript.
    const data = {
      ...((env.data ?? {}) as AgentSessionCreateData),
      session_id: `demo_sess_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    }
    agentSessionId = data.session_id
    return data
  }
  const env = await httpPost<AgentSessionCreateData>('/api/agent/session/create', {
    student_id: studentId,
  })
  const data = (env.data ?? { session_id: '' }) as AgentSessionCreateData
  if (data.session_id) agentSessionId = data.session_id
  return data
}

export async function getSessionHistory(
  sessionId: string,
  limit = 50,
): Promise<AgentHistoryMessage[]> {
  if (getApiMode() === 'mock') {
    const env = await mockGet<{ messages?: AgentHistoryMessage[] }>('agent/session.history.json')
    return (env.data as { messages?: AgentHistoryMessage[] } | undefined)?.messages ?? []
  }
  const env = await httpGet<{ messages?: AgentHistoryMessage[] }>(
    `/api/agent/session/${encodeURIComponent(sessionId)}/history`,
    { limit },
  )
  return (env.data as { messages?: AgentHistoryMessage[] } | undefined)?.messages ?? []
}

export async function ensureSession(studentId?: string): Promise<string> {
  if (agentSessionId) return agentSessionId
  const created = await createSession(studentId)
  return created.session_id
}

export async function listSessions(studentId?: string, limit = 40): Promise<AgentSessionListItem[]> {
  if (getApiMode() === 'mock') {
    return agentSessionId
      ? [{
          session_id: agentSessionId,
          title: '演示会话',
          status: 'active',
          updated_at: new Date().toISOString(),
          message_count: 0,
        }]
      : []
  }
  const env = await httpGet<{ sessions?: AgentSessionListItem[] }>('/api/agent/sessions', {
    student_id: studentId,
    limit,
  })
  return (env.data as { sessions?: AgentSessionListItem[] } | undefined)?.sessions ?? []
}

export async function archiveSession(sessionId: string): Promise<boolean> {
  if (getApiMode() === 'mock') return true
  const env = await httpPost<{ archived?: boolean }>(
    `/api/agent/session/${encodeURIComponent(sessionId)}/archive`,
    {},
  )
  return Boolean((env.data as { archived?: boolean } | undefined)?.archived)
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  if (getApiMode() === 'mock') {
    if (agentSessionId === sessionId) agentSessionId = null
    return true
  }
  await httpDelete(`/api/agent/session/${encodeURIComponent(sessionId)}`)
  if (agentSessionId === sessionId) agentSessionId = null
  return true
}
