import { computed, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { getAgentArtifact, type AgentArtifactDetail } from '@/api/agent'
import { getApiMode } from '@/api/config'
import { useAgentChatStore } from '@/stores/agentChat'
import { useUserStore } from '@/stores/user'
import type { ArtifactRef } from '@/types'

const STORAGE_PREFIX = 'agent-artifact-handoff:v1:'

type StoredHandoff = {
  version: 1
  sessionId: string
  ownerId: string
  artifact: ArtifactRef
}

function storageKey(sessionId: string, artifactId: string): string {
  return `${STORAGE_PREFIX}${encodeURIComponent(sessionId)}:${encodeURIComponent(artifactId)}`
}

function queryString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Stage the exact artifact_ref selected in the current Agent conversation.
 * The returned query is intentionally scoped by session because mock artifact IDs repeat.
 */
export function saveArtifactHandoff(
  artifact: ArtifactRef,
  sessionId?: string,
): { artifact_id: string; session_id: string } {
  const id = queryString(artifact?.artifact_id)
  const sid = queryString(sessionId) || queryString(useAgentChatStore().activeSessionId)
  if (!id || !sid) throw new Error('成果物或会话标识缺失，无法打开')

  const ownerId = queryString(useUserStore().currentUser?.id)
  const record: StoredHandoff = {
    version: 1,
    sessionId: sid,
    ownerId,
    artifact,
  }
  try {
    sessionStorage.setItem(storageKey(sid, id), JSON.stringify(record))
  } catch {
    throw new Error('无法暂存成果物；请检查浏览器存储是否可用')
  }
  return { artifact_id: id, session_id: sid }
}

/** Keep a mock feature edit and its originating conversation card on the same data. */
export function commitMockArtifactHandoff(sessionId: string, artifact: ArtifactRef): void {
  if (getApiMode() !== 'mock') throw new Error('正式成果不能通过浏览器暂存修改')
  const id = queryString(artifact?.artifact_id)
  const sid = queryString(sessionId)
  if (!id || !sid) throw new Error('成果物或会话标识缺失')
  // Validate the original owner/session before mutating any local data.
  readMockHandoff(id, sid)
  saveArtifactHandoff(artifact, sid)
  const conversation = useAgentChatStore().conversations.find(item => item.sessionId === sid)
  if (!conversation) return
  for (const message of conversation.messages) {
    for (const candidate of message.artifacts || []) {
      if (candidate.artifact_id === id) Object.assign(candidate, artifact)
    }
    for (const part of message.parts || []) {
      if (part.type === 'artifact_ref' && part.artifact.artifact_id === id) {
        Object.assign(part.artifact, artifact)
      }
    }
  }
}

function readMockHandoff(id: string, sessionId: string): AgentArtifactDetail {
  if (!sessionId) throw new Error('缺少会话标识，无法确认成果物来源')
  let raw: string | null
  try {
    raw = sessionStorage.getItem(storageKey(sessionId, id))
  } catch {
    throw new Error('无法读取浏览器中的成果物')
  }
  if (!raw) throw new Error('未找到这份成果物，请返回原对话重新打开')

  let record: StoredHandoff
  try {
    record = JSON.parse(raw) as StoredHandoff
  } catch {
    throw new Error('成果物缓存已损坏，请返回原对话重新打开')
  }
  if (record?.version !== 1 || record.sessionId !== sessionId || record.artifact?.artifact_id !== id) {
    throw new Error('成果物与当前会话不匹配')
  }
  const ownerId = queryString(useUserStore().currentUser?.id)
  if (record.ownerId && record.ownerId !== ownerId) {
    throw new Error('成果物不属于当前登录用户')
  }
  return { ...record.artifact, session_id: sessionId }
}

/** Resolve a routed artifact without treating a destination page's default data as that artifact. */
export function useAgentArtifactHandoff(artifactId?: () => string) {
  const route = useRoute()
  const id = computed(() => queryString(artifactId?.() || route.query.artifact_id))
  const sessionId = computed(() => queryString(route.query.session_id))
  const loading = ref(false)
  const error = ref('')
  const artifact = ref<AgentArtifactDetail | null>(null)
  const source = ref<'mock' | 'http' | null>(null)
  const ready = computed(() => !loading.value && !error.value && artifact.value !== null)
  const state = computed<'idle' | 'loading' | 'ready' | 'error'>(() => {
    if (loading.value) return 'loading'
    if (error.value) return 'error'
    return artifact.value ? 'ready' : 'idle'
  })
  let requestVersion = 0

  async function reload(): Promise<void> {
    const version = ++requestVersion
    artifact.value = null
    source.value = null
    error.value = ''
    const requestedId = id.value
    const requestedSession = sessionId.value
    if (!requestedId) {
      error.value = '缺少成果物标识'
      return
    }
    loading.value = true
    try {
      if (getApiMode() === 'mock') {
        const result = readMockHandoff(requestedId, requestedSession)
        if (version !== requestVersion) return
        artifact.value = result
        source.value = 'mock'
      } else {
        if (!requestedSession) throw new Error('缺少会话标识，无法核验成果物来源')
        const result = await getAgentArtifact(requestedId)
        if (version !== requestVersion) return
        if (!result || result.artifact_id !== requestedId || result.session_id !== requestedSession) {
          throw new Error('成果物与当前会话不匹配')
        }
        if (result.kind !== 'action_plan' || result.status !== 'completed' || !result.content?.body) {
          throw new Error('这份学习计划尚无可读取的正式内容')
        }
        artifact.value = result
        source.value = 'http'
      }
    } catch (cause) {
      if (version !== requestVersion) return
      error.value = cause instanceof Error ? cause.message : '读取成果物失败'
    } finally {
      if (version === requestVersion) loading.value = false
    }
  }

  watch([id, sessionId], () => { void reload() }, { immediate: true })

  return { id, sessionId, loading, error, artifact, source, ready, state, reload }
}
