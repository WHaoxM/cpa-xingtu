import { getApiMode } from './config'
import { httpGet, httpPost, httpFormPost } from './adapters/httpAdapter'
import { ApiError } from './types'
import type {TaskContext} from './agentTask'

export type AgentFileMeta = {
  file_id: string
  filename?: string
  mime_type?: string
  size_bytes?: number
  status?: string
  excerpt?: string
  error?: string
  ingest_engine?: string
  task_context?: TaskContext
}

export type AgentFileEvent = {
  seq: number
  event_id: string
  status: 'queued' | 'ingesting' | 'ready' | 'failed'
  phase: 'ingest' | 'upgrade'
  attempt: number
  occurred_at: string
  job_id?: string | null
  error?: string
}

export type AgentFileReplay = {
  file_id: string
  events: AgentFileEvent[]
  cursor: number
  has_more: boolean
  latest_seq: number
  snapshot: { status?: string; job_status?: string; upgrade_status?: string; updated_at?: string }
  source: string
}

export type VoiceTurn = {
  turn_id: string
  session_id?: string
  status?: string
  transcript?: string
  interim_transcript?: string
  stt_provider?: string
  lang?: string
  error?: string
}

function unwrapError(e: unknown): Error {
  if (e instanceof ApiError) {
    const body = e.body as { error?: string; message?: string } | null
    const detail = body?.error || body?.message || e.message
    return new Error(detail || `上传失败 (HTTP ${e.status})`)
  }
  if (e instanceof Error) return e
  return new Error(String(e))
}

export async function uploadAgentFile(
  file: File,
  opts?: { studentId?: string; sessionId?: string; purpose?: string; taskContextVersion?: number },
): Promise<AgentFileMeta> {
  if (getApiMode() !== 'http') {
    return {
      file_id: `mock_file_${Date.now()}`,
      filename: file.name,
      status: 'ready',
      excerpt: `演示附件 ${file.name}`,
    }
  }
  const form = new FormData()
  form.append('file', file)
  // Optional legacy hint only; backend ownership is always resolved from Principal.
  if (opts?.studentId) form.append('student_id', opts.studentId)
  if (opts?.sessionId) form.append('session_id', opts.sessionId)
  if (opts?.taskContextVersion !== undefined) form.append('task_context_version', String(opts.taskContextVersion))
  form.append('purpose', opts?.purpose || 'chat_attachment')

  try {
    const env = await httpFormPost<AgentFileMeta>('/api/agent/files', form)
    const data = env.data
    if (!data?.file_id) {
      throw new Error(env.error || '上传未返回 file_id（请确认后端已注册 /api/agent/files）')
    }
    // The file_id is authoritative even while a durable worker is still parsing.
    // The UI follows the replayable state endpoint instead of inventing a timeout result.
    return data
  } catch (e) {
    throw unwrapError(e)
  }
}

export async function getAgentFileEvents(fileId: string, after = 0): Promise<AgentFileReplay> {
  const env = await httpGet<AgentFileReplay>(`/api/agent/files/${encodeURIComponent(fileId)}/events`, {
    after,
    limit: 100,
  })
  if (!env.data) throw new Error(env.error || '文件解析状态未返回')
  return env.data
}

export async function mountSessionResources(
  sessionId: string,
  fileIds: string[],
  studentId?: string,
): Promise<unknown> {
  if (getApiMode() !== 'http' || !sessionId || !fileIds.length) return null
  try {
    return await httpPost(`/api/agent/session/${sessionId}/resources`, {
      student_id: studentId,
      resources: fileIds.map(file_id => ({ type: 'file', file_id })),
    })
  } catch (e) {
    throw unwrapError(e)
  }
}

export async function startVoiceTurn(opts: {
  sessionId?: string | null
  studentId?: string
  lang?: string
}): Promise<VoiceTurn> {
  if (getApiMode() !== 'http') {
    return {
      turn_id: `mock_vt_${Date.now()}`,
      status: 'capturing',
      session_id: opts.sessionId || undefined,
    }
  }
  const env = await httpPost<VoiceTurn>('/api/agent/voice/turns', {
    session_id: opts.sessionId,
    student_id: opts.studentId,
    lang: opts.lang || 'zh-CN',
    stt_provider: 'browser_web_speech',
  })
  return env.data as VoiceTurn
}

export async function finalizeVoiceTurn(
  turnId: string,
  payload: {
    transcript: string
    interim_transcript?: string
    confidence?: number
    is_final?: boolean
  },
): Promise<VoiceTurn> {
  if (getApiMode() !== 'http') {
    return { turn_id: turnId, status: 'ready', transcript: payload.transcript }
  }
  const env = await httpPost<VoiceTurn>(
    `/api/agent/voice/turns/${turnId}`,
    { ...payload, is_final: payload.is_final !== false },
  )
  return env.data as VoiceTurn
}

export async function getAgentFile(fileId: string): Promise<AgentFileMeta | null> {
  if (getApiMode() !== 'http') return null
  try {
    const env = await httpGet<AgentFileMeta>(`/api/agent/files/${fileId}`)
    return env.data ?? null
  } catch {
    return null
  }
}
