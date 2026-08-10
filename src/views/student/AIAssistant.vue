<!-- 页面：AI助手；路由：student/ai-assistant（student-ai-assistant）；角色：STUDENT -->
<script setup lang="ts">
import { ref, computed, nextTick, watch, onBeforeUnmount, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useLearningStore, useAgentChatStore, useUserStore } from '@/stores'
import { useResumeStore } from '@/stores/resume'
import { usePageEntrance } from '@/composables/usePageEntrance'
import { useChatAttachments } from '@/composables/useChatAttachments'
import { useSpeechInput } from '@/composables/useSpeechInput'
import { renderMarkdown } from '@/utils/markdown'
import { getApiMode } from '@/api/config'
import { getAgentSessionId } from '@/api/agent'
import { mountSessionResources } from '@/api/agentMedia'
import { getPipelineStatus } from '@/api/pipeline'
import { toFriendlyApiError } from '@/api/types'
import { CURRENT_USER_ID } from '@/mock/data'
import type { AIMessage, AIToolCall } from '@/types'
import MessagePartsRenderer from '@/components/agent/MessagePartsRenderer.vue'
import ExpertSelector from '@/components/ExpertSelector.vue'

function resolveStudentId(): string {
  try {
    return useUserStore().currentUser?.id || CURRENT_USER_ID
  } catch {
    return CURRENT_USER_ID
  }
}

const { pageRef } = usePageEntrance()
const learningStore = useLearningStore()
const agentChat = useAgentChatStore()
const resumeStore = useResumeStore()
const {
  attachments,
  busy: attachmentsBusy,
  addFiles,
  removeAttachment,
  clearAttachments,
  readyFileIds,
} = useChatAttachments()

const messages = computed(() => agentChat.messages)
const inputMessage = ref('')
const messagesContainer = ref<HTMLDivElement>()
const fileInputRef = ref<HTMLInputElement>()
const loading = ref(false)
const sidebarOpen = ref(true)
const isInitialState = computed(() => messages.value.length === 0)
const isHttpMode = computed(() => getApiMode() === 'http')

onMounted(() => {
  void agentChat.bootstrap()
})

/** Qoder-aligned: Ask | Agent | Experts (default Ask) */
type InteractionMode = 'ask' | 'agent' | 'experts'
const interactionMode = ref<InteractionMode>('ask')
const modeOptions: { id: InteractionMode; label: string; tip: string }[] = [
  { id: 'ask', label: 'Ask', tip: '轻量问答，不调用业务写工具' },
  { id: 'agent', label: 'Agent', tip: '单智能体执行画像/匹配/报告等任务' },
  { id: 'experts', label: 'Experts', tip: '多专家协作，适合端到端链路' },
]

/** 专家角色选择（Experts模式下） */
const selectedRoleId = ref<string>('')
const showExpertSelector = ref(false)
const roleOptions = ref<Array<{ id: string; name: string; title: string; company: string }>>([])

async function loadRoles() {
  try {
    const { listRoles } = await import('@/api/roles')
    const data = await listRoles()
    roleOptions.value = data.roles || []
  } catch (e) {
    console.warn('Failed to load roles:', e)
  }
}

function setInteractionMode(mode: InteractionMode) {
  interactionMode.value = mode
  if (mode === 'experts') {
    showExpertSelector.value = true
    if (roleOptions.value.length === 0) {
      loadRoles()
    }
  } else {
    showExpertSelector.value = false
    selectedRoleId.value = ''
  }
}

function onExpertSelected(expert: any) {
  selectedRoleId.value = expert.id
  showExpertSelector.value = false
}

function onExpertCancel() {
  showExpertSelector.value = false
  if (!selectedRoleId.value) {
    interactionMode.value = 'ask'
  }
}

function getSelectedExpertName(): string {
  const role = roleOptions.value.find((r) => r.id === selectedRoleId.value)
  return role ? `${role.name} - ${role.title}` : ''
}

function applyUpgradeHint(to?: string) {
  if (to === 'ask' || to === 'agent' || to === 'experts') {
    interactionMode.value = to
  }
}

/* ── 流式 / 思考 ── */
const streamingMsgId = ref<string | null>(null)
const streamingContent = ref('')
const isThinking = ref(false)
const isProcessing = ref(false)
const liveThinkingOpen = ref(true)
const thinkingStreamText = ref('')
const thinkingStartTime = ref(0)
const thinkingElapsed = ref(0)
const expandedThinkingIds = ref<Set<string>>(new Set())
const expandedToolArgs = ref<Set<string>>(new Set())
const processingLabel = ref('正在处理')
let streamTimer: ReturnType<typeof setInterval> | null = null
let thinkTimer: ReturnType<typeof setInterval> | null = null
let elapsedTimer: ReturnType<typeof setInterval> | null = null
const pollTimers = new Map<string, ReturnType<typeof setInterval>>()

const lastVoiceTurnId = ref<string | null>(null)
const voiceBoundText = ref('')
const {
  supported: speechSupported,
  listening: speechListening,
  error: speechError,
  interim: speechInterim,
  turnId: speechTurnId,
  toggle: toggleSpeech,
} = useSpeechInput({
  getSessionId: () => getAgentSessionId(),
  getStudentId: () => resolveStudentId(),
  onInterim: (text) => {
    if (text && !inputMessage.value) processingLabel.value = '正在听写…'
  },
  onResult: (text) => {
    lastVoiceTurnId.value = speechTurnId.value
    voiceBoundText.value = text
    inputMessage.value = inputMessage.value
      ? `${inputMessage.value.trim()} ${text}`
      : text
  },
})

watch(inputMessage, (v) => {
  // User edited away from speech transcript → drop sticky voice_turn_id
  if (lastVoiceTurnId.value && voiceBoundText.value) {
    const t = (v || '').trim()
    if (t && t !== voiceBoundText.value && !t.endsWith(voiceBoundText.value)) {
      lastVoiceTurnId.value = null
      voiceBoundText.value = ''
    }
  }
})

onBeforeUnmount(() => {
  clearAllTimers()
  stopAllPolls()
})

function clearAllTimers() {
  if (streamTimer) { clearInterval(streamTimer); streamTimer = null }
  if (thinkTimer) { clearInterval(thinkTimer); thinkTimer = null }
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
}

function stopAllPolls() {
  for (const t of pollTimers.values()) clearInterval(t)
  pollTimers.clear()
}

function formatThinkingProse(steps: string[]): string {
  return steps
    .map(step => step.replace(/\.\.\.$/u, '。').replace(/\.\.\./gu, '。').trim())
    .filter(Boolean)
    .join('\n\n')
}

function thoughtLabel(seconds?: number): string {
  if (seconds == null || seconds <= 0) return '思考过程'
  const n = Math.max(1, Math.round(Number(seconds)))
  return `思考了 ${n} 秒`
}

const quickPrompts = [
  { label: '方向', text: '帮我分析适合的职业方向' },
  { label: '画像', text: '查看我的能力画像' },
  { label: '计划', text: '制定本周学习计划' },
  { label: '自评', text: '做一次技能自评' },
  { label: '导航', text: '各模块功能介绍' },
  { label: '匹配', text: '我和目标岗位差距有多大？' },
  { label: '建议', text: '现阶段我应该重点学什么？' },
  { label: '简历', text: '简历还需要补充什么？' },
  { label: '课程', text: '有哪些课程适合我？' },
]

function scrollToBottom() {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTo({
        top: messagesContainer.value.scrollHeight,
        behavior: 'smooth',
      })
    }
  })
}

watch([streamingContent, thinkingStreamText, isProcessing], () => {
  scrollToBottom()
})

/**
 * Profile hint for Agent/Experts only.
 * Claude/Qoder rule: never rewrite Ask user text with cross-session resume/LTM.
 */
function buildResumePrefix(): string {
  if (interactionMode.value === 'ask') return ''
  if (!resumeStore.isParsed) return ''
  const role = resumeStore.insights?.predictedRole ?? ''
  const topSkills = resumeStore.parsedSkills.slice(0, 5).map(s => s.name).join('、')
  const targets = learningStore.targetRoles.map(r => r.role).join('、')
  const parts: string[] = []
  if (role) parts.push(`预测方向：${role}`)
  if (topSkills) parts.push(`已掌握技能：${topSkills}`)
  if (targets) parts.push(`关注方向：${targets}`)
  if (!parts.length) return ''
  return `[用户概况] ${parts.join('；')} | 询问：`
}

function simulateThinking(steps: string[]): Promise<{ duration: number; prose: string }> {
  return new Promise(resolve => {
    const prose = formatThinkingProse(steps)
    if (!prose) {
      resolve({ duration: 1, prose: '' })
      return
    }
    thinkingStreamText.value = ''
    isThinking.value = true
    liveThinkingOpen.value = true
    thinkingStartTime.value = Date.now()
    thinkingElapsed.value = 0

    elapsedTimer = setInterval(() => {
      thinkingElapsed.value = Math.floor((Date.now() - thinkingStartTime.value) / 1000)
    }, 200)

    // Longer traces stream in larger chunks so deep thinking stays snappy.
    const baseChunk = prose.length > 600 ? 10 : prose.length > 280 ? 6 : 3
    let idx = 0
    const tick = () => {
      if (idx < prose.length) {
        const chunk = baseChunk + (Math.random() > 0.7 ? 4 : 0)
        thinkingStreamText.value += prose.slice(idx, idx + chunk)
        idx += chunk
        thinkTimer = setTimeout(tick, 12 + Math.random() * 18) as unknown as ReturnType<typeof setInterval>
      } else {
        if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
        thinkingStreamText.value = prose
        const duration = Math.max(1, Math.round((Date.now() - thinkingStartTime.value) / 1000))
        thinkingElapsed.value = duration
        thinkTimer = setTimeout(() => {
          isThinking.value = false
          liveThinkingOpen.value = false
          resolve({ duration, prose })
        }, 280) as unknown as ReturnType<typeof setInterval>
      }
    }
    tick()
  })
}

function startProcessingWait() {
  isProcessing.value = true
  processingLabel.value = '正在处理'
  thinkingStartTime.value = Date.now()
  thinkingElapsed.value = 0
  elapsedTimer = setInterval(() => {
    thinkingElapsed.value = Math.floor((Date.now() - thinkingStartTime.value) / 1000)
  }, 200)
}

function stopProcessingWait() {
  if (elapsedTimer) { clearInterval(elapsedTimer); elapsedTimer = null }
  isProcessing.value = false
}

function simulateStreaming(msgId: string, fullContent: string): Promise<void> {
  return new Promise(resolve => {
    streamingMsgId.value = msgId
    streamingContent.value = ''
    let idx = 0
    const speed = isHttpMode.value ? 12 + Math.random() * 10 : 22 + Math.random() * 18

    streamTimer = setInterval(() => {
      if (idx < fullContent.length) {
        const chunkSize = Math.random() > 0.9 ? 4 : (Math.random() > 0.7 ? 2 : 1)
        streamingContent.value += fullContent.slice(idx, idx + chunkSize)
        idx += chunkSize
      } else {
        if (streamTimer) { clearInterval(streamTimer); streamTimer = null }
        streamingMsgId.value = null
        streamingContent.value = ''
        resolve()
      }
    }, speed)
  })
}

function getDisplayContent(msg: AIMessage): string {
  if (msg.id === streamingMsgId.value) return renderMarkdown(streamingContent.value)
  return renderMarkdown(msg.content)
}

function isThinkingExpanded(msgId: string): boolean {
  return expandedThinkingIds.value.has(msgId)
}

function toggleThinking(msgId: string) {
  if (expandedThinkingIds.value.has(msgId)) expandedThinkingIds.value.delete(msgId)
  else expandedThinkingIds.value.add(msgId)
}

function toggleLiveThinking() {
  liveThinkingOpen.value = !liveThinkingOpen.value
}

function toggleToolArgs(key: string) {
  if (expandedToolArgs.value.has(key)) expandedToolArgs.value.delete(key)
  else expandedToolArgs.value.add(key)
}

function pollPipelineTask(msgId: string, toolIndex: number, taskId: string) {
  const key = `${msgId}:${taskId}`
  if (pollTimers.has(key)) return

  const timer = setInterval(async () => {
    try {
      const env = await getPipelineStatus(taskId)
      const data = (env.data ?? env) as Record<string, unknown>
      const status = String(data.status || data.state || '').toLowerCase()
      const msg = agentChat.messages.find(m => m.id === msgId)
        || agentChat.conversations.flatMap(c => c.messages).find(m => m.id === msgId)
      const tool = msg?.toolCalls?.[toolIndex]
      if (!tool) return
      tool.taskStatus = status || tool.taskStatus
      if (status.includes('done') || status.includes('success') || status.includes('complet')) {
        tool.status = 'done'
        tool.summary = tool.summary || '任务已完成'
        clearInterval(timer)
        pollTimers.delete(key)
      } else if (status.includes('fail') || status.includes('error')) {
        tool.status = 'error'
        tool.summary = '任务失败'
        clearInterval(timer)
        pollTimers.delete(key)
      } else {
        tool.status = 'running'
      }
    } catch {
      /* keep polling quietly */
    }
  }, 2000)

  pollTimers.set(key, timer)
  setTimeout(() => {
    if (pollTimers.has(key)) {
      clearInterval(pollTimers.get(key)!)
      pollTimers.delete(key)
    }
  }, 60_000)
}

function startTaskPolls(msgId: string, tools?: AIToolCall[]) {
  if (!tools?.length) return
  tools.forEach((tool, i) => {
    if (tool.taskId && (tool.name.includes('pipeline') || tool.taskId)) {
      tool.status = 'running'
      pollPipelineTask(msgId, i, tool.taskId)
    }
  })
}

async function sendMessage(preset?: string) {
  const userMsg = (preset ?? inputMessage.value).trim()
  const fileIds = readyFileIds()
  if ((!userMsg && !fileIds.length) || loading.value || attachmentsBusy.value) return

  if (!preset) inputMessage.value = ''
  const readyAtts = attachments.value
    .filter(a => a.status === 'ready')
    .map(a => ({ name: a.name, fileId: a.fileId }))
  // Claude/Qoder: plain text + content_parts / attachment_ids (no body dump)
  const apiPayload = userMsg
  const voiceTurn = lastVoiceTurnId.value || undefined
  const contentParts = [
    ...(userMsg ? [{ type: 'text', text: userMsg }] : []),
    ...readyAtts
      .filter(a => a.fileId)
      .map(a => ({ type: 'document', file_id: a.fileId!, title: a.name })),
    ...(voiceTurn ? [{ type: 'voice_transcript', turn_id: voiceTurn, text: '' }] : []),
  ]

  try {
    await agentChat.ensureActiveSession()
  } catch (e) {
    console.warn('[ai] ensure session failed', e)
  }

  const now = new Date().toISOString().replace('T', ' ').substring(0, 16)
  agentChat.addMessage({
    role: 'user',
    content: userMsg || (fileIds.length ? `（已附带 ${fileIds.length} 个附件）` : ''),
    timestamp: now,
    attachments: readyAtts.length ? readyAtts.map(a => ({ name: a.name })) : undefined,
  })

  loading.value = true
  scrollToBottom()

  try {
    if (isHttpMode.value) {
      const sid = getAgentSessionId()
      const studentId = resolveStudentId()
      if (sid && fileIds.length) {
        try {
          await mountSessionResources(sid, fileIds, studentId)
        } catch (e) {
          const msg = e instanceof Error ? e.message : '附件挂载失败'
          agentChat.addMessage({
            role: 'assistant',
            content: `附件未能挂载：${msg}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
            status: 'done',
          })
          loading.value = false
          return
        }
      }
      startProcessingWait()
      const result = await learningStore.getAIResponseFromApi(apiPayload, {
        interactionMode: interactionMode.value,
        // Experts ≠ 强制端到端；仅显式业务意图才由后端 detect_plan_template 选计划
        planMode: false,
        attachmentIds: fileIds,
        voiceTurnId: voiceTurn,
        contentParts,
        roleId: interactionMode.value === 'experts' ? selectedRoleId.value : undefined,
      })
      lastVoiceTurnId.value = null
      voiceBoundText.value = ''
      clearAttachments()
      stopProcessingWait()

      // 接口返回后先播 thinking 独白，再流式出正式回复
      const { duration: thinkSeconds, prose } = await simulateThinking(result.thinking)
      const duration = result.elapsedSeconds ?? thinkSeconds
      const tools = (result.toolCalls || []).map(t => ({ ...t }))

      const aiMsg = agentChat.addMessage({
        role: 'assistant',
        content: result.content,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        thinking: prose,
        thinkingDuration: duration,
        status: 'streaming',
        toolCalls: tools,
        parts: result.parts,
        artifacts: result.artifacts,
        turnId: result.turnId,
        interactionMode: result.interactionMode || interactionMode.value,
        upgradeHint: result.upgradeHint,
        sessionTitle: result.sessionTitle,
        sessionSummary: result.sessionSummary,
      })

      // 后端返回 session_title 时更新侧边栏标题
      if (result.sessionTitle && agentChat.activeSessionId) {
        const conv = agentChat.conversations.find(c => c.sessionId === agentChat.activeSessionId)
        if (conv && (conv.title === '新对话' || conv.title === '对话')) {
          conv.title = result.sessionTitle
        }
      }

      startTaskPolls(aiMsg.id, tools)
      await simulateStreaming(aiMsg.id, result.content)

      const target = agentChat.messages.find(m => m.id === aiMsg.id)
      if (target) target.status = 'done'
    } else {
      const result = await learningStore.getAIResponseFromApi(apiPayload)
      const { duration, prose } = await simulateThinking(result.thinking)
      const tools = (result.toolCalls || []).map(t => ({ ...t, status: 'done' as const }))

      const aiMsg = agentChat.addMessage({
        role: 'assistant',
        content: result.content,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        thinking: prose,
        thinkingDuration: duration,
        status: 'streaming',
        toolCalls: tools,
        artifacts: result.artifacts,
      })

      await simulateStreaming(aiMsg.id, result.content)
      const target = agentChat.messages.find(m => m.id === aiMsg.id)
      if (target) target.status = 'done'
    }

    clearAttachments()
    void agentChat.refreshSessionList()
  } catch (e) {
    stopProcessingWait()
    isThinking.value = false
    const friendly = toFriendlyApiError(e)
    try {
      await agentChat.ensureActiveSession()
      agentChat.addMessage({
        role: 'assistant',
        content: friendly.kind === 'network'
          ? friendly.message
          : `抱歉，这次没有拿到有效回复：${friendly.message}`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        status: 'done',
      })
    } catch {
      /* ignore */
    }
  } finally {
    loading.value = false
    scrollToBottom()
  }
}

function useQuickPrompt(text: string) {
  void sendMessage(text)
}

async function clearChat() {
  clearAllTimers()
  stopAllPolls()
  loading.value = false
  streamingMsgId.value = null
  isThinking.value = false
  isProcessing.value = false
  liveThinkingOpen.value = true
  thinkingStreamText.value = ''
  expandedThinkingIds.value = new Set()
  clearAttachments()
  // New backend session = fresh STM; previous thread stays in sidebar
  await agentChat.startNewConversation()
}

async function onSelectConversation(sessionId: string) {
  if (loading.value || sessionId === agentChat.activeSessionId) return
  clearAllTimers()
  stopAllPolls()
  streamingMsgId.value = null
  isThinking.value = false
  isProcessing.value = false
  thinkingStreamText.value = ''
  expandedThinkingIds.value = new Set()
  await agentChat.switchSession(sessionId)
  await nextTick()
  scrollToBottom()
}

async function onDeleteConversation(sessionId: string, e: Event) {
  e.stopPropagation()
  if (loading.value) return
  await agentChat.removeConversation(sessionId)
}

function formatSessionTime(iso?: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return String(iso).slice(5, 16)
  const mm = `${d.getMonth() + 1}`.padStart(2, '0')
  const dd = `${d.getDate()}`.padStart(2, '0')
  const hh = `${d.getHours()}`.padStart(2, '0')
  const mi = `${d.getMinutes()}`.padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

function onComposerKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault()
    void sendMessage()
  }
}

function openFilePicker() {
  fileInputRef.value?.click()
}

async function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  try {
    await agentChat.ensureActiveSession()
  } catch (err) {
    console.warn('[ai] ensure session before upload failed', err)
  }
  await addFiles(input.files, {
    sessionId: getAgentSessionId(),
    studentId: resolveStudentId(),
  })
  input.value = ''
}

function toolStatusLabel(tool: AIToolCall): string {
  if (tool.status === 'running') return tool.taskStatus ? `运行中 · ${tool.taskStatus}` : '运行中'
  if (tool.status === 'error') return '失败'
  return '完成'
}

/** 兼容旧消息里塞进正文的「已附带 N 个附件」 */
function displayUserContent(msg: AIMessage): string {
  return msg.content
    .replace(/\n*（已附带\s*\d+\s*个附件）\s*$/u, '')
    .trim()
}

function displayUserAttachments(msg: AIMessage): { name: string }[] {
  if (msg.attachments?.length) return msg.attachments
  const m = msg.content.match(/（已附带\s*(\d+)\s*个附件）/)
  if (!m?.[1]) return []
  const n = Math.min(6, Math.max(1, Number(m[1]) || 1))
  return Array.from({ length: n }, (_, i) => ({ name: `附件 ${i + 1}` }))
}

/** 思考正文：去掉 engine 名与小数秒，避免露出 supervisor / 5.64s */
function displayThinkingParas(thinking: string): string[] {
  return thinking
    .split(/\n\n+/)
    .map((para) => {
      let p = para.trim()
      if (!p) return ''
      if (/supervisor|langgraph|subagent|_agent/i.test(p) && /处理/.test(p)) {
        return '已整理上下文与工具结果，准备给出建议。'
      }
      p = p.replace(/[·•]\s*\d+(?:\.\d+)?\s*s\b/gi, '')
      p = p.replace(/由\s*[A-Za-z0-9_]+\s*处理/g, '已完成处理')
      return p.trim()
    })
    .filter(Boolean)
}
</script>


<template>
  <div ref="pageRef" class="ai-page page page--compact">
    <div class="ai-shell" :class="{ 'ai-shell--with-rail': sidebarOpen }">
      <aside v-if="sidebarOpen" class="ai-rail" aria-label="会话列表">
        <div class="ai-rail__head">
          <button type="button" class="ai-rail__new" :disabled="loading" @click="clearChat">
            <Icon icon="lucide:plus" :width="14" />
            <span>新对话</span>
          </button>
          <button
            type="button"
            class="ai-rail__collapse"
            title="收起会话栏"
            @click="sidebarOpen = false"
          >
            <Icon icon="lucide:panel-left-close" :width="15" />
          </button>
        </div>
        <div class="ai-rail__list">
          <button
            v-for="c in agentChat.sidebarItems"
            :key="c.sessionId"
            type="button"
            class="ai-rail__item"
            :class="{ 'is-active': c.sessionId === agentChat.activeSessionId }"
            :disabled="loading || agentChat.switching"
            @click="onSelectConversation(c.sessionId)"
          >
            <div class="ai-rail__item-main">
              <span class="ai-rail__title">{{ c.title || '新对话' }}</span>
              <span class="ai-rail__time">{{ formatSessionTime(c.updatedAt) }}</span>
            </div>
            <button
              type="button"
              class="ai-rail__delete"
              title="删除会话"
              @click="onDeleteConversation(c.sessionId, $event)"
            >
              <Icon icon="lucide:trash-2" :width="12" />
            </button>
          </button>
          <p v-if="!agentChat.sidebarItems.length" class="ai-rail__empty">暂无历史会话</p>
        </div>
      </aside>

      <div class="ai-main">
      <!-- 侧栏已有「新对话」；仅侧栏收起时保留顶栏入口 -->
      <header v-if="!sidebarOpen" class="ai-topbar ai-topbar--chat">
        <button
          type="button"
          class="ai-topbar__reset"
          title="打开会话栏"
          @click="sidebarOpen = true"
        >
          <Icon icon="lucide:panel-left" :width="14" />
          <span>会话</span>
        </button>
        <div class="ai-topbar__spacer" />
        <button
          type="button"
          class="ai-topbar__reset"
          :disabled="loading"
          @click="clearChat"
        >
          <Icon icon="lucide:plus" :width="14" />
          <span>新对话</span>
        </button>
      </header>

      <div v-if="showExpertSelector" class="expert-modal">
        <div class="expert-modal__overlay" @click="onExpertCancel"></div>
        <div class="expert-modal__content">
          <ExpertSelector @select="onExpertSelected" @cancel="onExpertCancel" />
        </div>
      </div>

      <div ref="messagesContainer" class="ai-messages" :class="{ 'ai-messages--empty': isInitialState }">
        <template v-if="isInitialState">
          <div class="welcome">
            <div class="welcome__mark" aria-hidden="true">助</div>
            <h2 class="welcome__title">有什么我可以帮你的？</h2>
            <p class="welcome__sub">上传文档、语音输入，或从下方任选一个话题开始。</p>
            <div class="welcome__grid">
              <button
                v-for="p in quickPrompts"
                :key="p.text"
                type="button"
                class="prompt-card"
                :disabled="loading"
                @click="useQuickPrompt(p.text)"
              >
                <span class="prompt-card__label">{{ p.label }}</span>
                <span class="prompt-card__text">{{ p.text }}</span>
              </button>
            </div>
          </div>
        </template>

        <template v-else>
          <div class="msg-list">
            <template v-for="msg in messages" :key="msg.id">
              <div v-if="msg.role === 'user'" class="msg msg--user">
                <div class="msg__user-col">
                  <div v-if="displayUserAttachments(msg).length" class="msg__atts">
                    <span
                      v-for="(att, ai) in displayUserAttachments(msg)"
                      :key="`${msg.id}-a-${ai}`"
                      class="msg__att"
                    >
                      <Icon icon="lucide:file-text" :width="12" />
                      {{ att.name }}
                    </span>
                  </div>
                  <div class="msg__bubble">{{ displayUserContent(msg) }}</div>
                </div>
              </div>

              <div v-else class="msg msg--assistant">
                <div class="msg__avatar" aria-hidden="true">助</div>
                <div class="msg__stack">
                  <MessagePartsRenderer
                    :message="msg"
                    :is-streaming="msg.id === streamingMsgId"
                    :streaming-text="streamingContent"
                    @upgrade="applyUpgradeHint"
                  />
                  <span v-if="msg.id === streamingMsgId" class="cursor" aria-hidden="true" />
                </div>
              </div>
            </template>

            <!-- mock 思考独白 -->
            <div v-if="isThinking" class="msg msg--assistant">
              <div class="msg__avatar msg__avatar--pulse" aria-hidden="true">助</div>
              <div class="msg__stack">
                <div class="thought thought--live" :class="{ 'thought--open': liveThinkingOpen }">
                  <button type="button" class="thought__toggle" @click="toggleLiveThinking">
                    <Icon class="thought__chevron" icon="lucide:chevron-right" :width="13" />
                    <span class="thought__label thought__label--live">
                      <span class="thought__shimmer">正在思考</span>
                    </span>
                    <span class="thought__timer">{{ thinkingElapsed }}s</span>
                  </button>
                  <div v-if="liveThinkingOpen" class="thought__body">
                    <p
                      v-for="(para, pi) in thinkingStreamText.split('\n\n').filter(Boolean)"
                      :key="`live-t-${pi}`"
                      class="thought__p"
                    >{{ para }}</p>
                    <span class="thought__cursor" aria-hidden="true" />
                  </div>
                </div>
              </div>
            </div>

            <!-- http 处理中 -->
            <div v-if="isProcessing" class="msg msg--assistant">
              <div class="msg__avatar msg__avatar--pulse" aria-hidden="true">助</div>
              <div class="msg__stack">
                <div class="thought thought--live thought--open">
                  <div class="thought__toggle thought__toggle--static">
                    <span class="thought__label thought__label--live">
                      <span class="thought__shimmer">{{ processingLabel }}</span>
                    </span>
                    <span class="thought__timer">{{ thinkingElapsed }}s</span>
                  </div>
                  <p class="thought__p thought__p--plain">正在分析问题与上下文…</p>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <div class="ai-composer">
        <div class="mode-switch" role="group" aria-label="交互模式">
          <button
            v-for="opt in modeOptions"
            :key="opt.id"
            type="button"
            class="mode-switch__btn"
            :class="{ 'is-active': interactionMode === opt.id }"
            :title="opt.tip"
            :disabled="loading"
            @click="setInteractionMode(opt.id)"
          >
            {{ opt.label }}
          </button>
        </div>
        <div v-if="interactionMode === 'experts' && selectedRoleId" class="selected-expert">
          <span class="selected-expert__label">当前专家：</span>
          <span class="selected-expert__name">{{ getSelectedExpertName() }}</span>
          <button class="selected-expert__change" @click="showExpertSelector = true">切换</button>
        </div>
        <div v-if="attachments.length" class="attach-row">
          <div
            v-for="att in attachments"
            :key="att.id"
            class="attach-chip"
            :class="`attach-chip--${att.status}`"
          >
            <Icon
              :icon="att.status === 'error' ? 'lucide:alert-circle' : att.status === 'reading' ? 'lucide:loader' : 'lucide:file-text'"
              :width="13"
            />
            <span class="attach-chip__name">{{ att.name }}</span>
            <span v-if="att.status === 'error'" class="attach-chip__err">{{ att.error }}</span>
            <button type="button" class="attach-chip__x" aria-label="移除" @click="removeAttachment(att.id)">
              <Icon icon="lucide:x" :width="12" />
            </button>
          </div>
        </div>

        <div class="ai-composer__box" :class="{ 'is-disabled': loading }">
          <textarea
            v-model="inputMessage"
            class="ai-composer__input"
            rows="1"
            :placeholder="loading ? '正在整理回复…' : '描述你的问题，Enter 发送 · Shift+Enter 换行'"
            :disabled="loading"
            @keydown="onComposerKeydown"
          />
          <div class="ai-composer__bar">
            <div class="ai-composer__actions">
              <input
                ref="fileInputRef"
                type="file"
                class="ai-composer__file"
                multiple
                accept=".txt,.md,.json,.csv,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                @change="onFilesSelected"
              >
              <button
                type="button"
                class="icon-btn"
                title="上传附件"
                :disabled="loading"
                @click="openFilePicker"
              >
                <Icon icon="lucide:paperclip" :width="16" />
              </button>
              <button
                type="button"
                class="icon-btn"
                :class="{ 'is-active': speechListening }"
                :disabled="loading || !speechSupported"
                :title="speechSupported ? (speechListening ? '停止语音' : '语音输入') : '当前浏览器不支持语音输入'"
                @click="toggleSpeech()"
              >
                <Icon :icon="speechListening ? 'lucide:mic-off' : 'lucide:mic'" :width="16" />
              </button>
              <span v-if="speechError" class="ai-composer__speech-err">{{ speechError }}</span>
            </div>
            <div class="ai-composer__right">
              <span class="ai-composer__hint">回复仅供学习规划参考</span>
              <button
                type="button"
                class="send-btn"
                :disabled="(!inputMessage.trim() && !readyFileIds().length) || loading || attachmentsBusy"
                aria-label="发送"
                @click="sendMessage()"
              >
                <Icon icon="lucide:arrow-up" :width="16" />
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-page {
  height: calc(100vh - 80px);
  padding: 0 !important;
}

.ai-shell {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: var(--color-background);
}

.ai-shell--with-rail {
  flex-direction: row;
  align-items: stretch;
}

.ai-rail {
  width: 248px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--color-border);
  background: color-mix(in srgb, var(--color-surface) 86%, var(--color-background));
  min-height: 0;
}

.ai-rail__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 12px 10px;
}

.ai-rail__new {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 10px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 13px;
  cursor: pointer;
}

.ai-rail__new:hover:not(:disabled) {
  border-color: var(--color-border-strong);
}

.ai-rail__new:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.ai-rail__collapse {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
}

.ai-rail__collapse:hover {
  color: var(--color-text);
  background: var(--color-surface);
}

.ai-rail__list {
  flex: 1;
  overflow: auto;
  padding: 4px 8px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-height: 0;
}

.ai-rail__item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 10px 10px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  text-align: left;
  cursor: pointer;
}

.ai-rail__item:hover {
  background: var(--color-surface);
}

.ai-rail__item.is-active {
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
  border-color: color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
}

.ai-rail__item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.ai-rail__title {
  font-size: 13px;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-rail__time {
  font-size: 11px;
  color: var(--color-text-muted);
}

.ai-rail__delete {
  opacity: 0;
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  flex-shrink: 0;
}

.ai-rail__item:hover .ai-rail__delete,
.ai-rail__item.is-active .ai-rail__delete {
  opacity: 1;
}

.ai-rail__delete:hover {
  color: var(--color-danger, #b42318);
  background: color-mix(in srgb, #b42318 8%, transparent);
}

.ai-rail__empty {
  margin: 18px 8px;
  font-size: 12px;
  color: var(--color-text-muted);
}

.ai-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.ai-topbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 14px 24px 4px;
  max-width: 720px;
  width: 100%;
  margin: 0 auto;
  box-sizing: border-box;
  min-height: 12px;
}

.ai-topbar--chat {
  padding-top: 16px;
  padding-bottom: 8px;
  min-height: 44px;
}

.ai-topbar__spacer {
  flex: 1;
}

.ai-topbar__reset {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 7px 12px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text-muted);
  font-size: 12.5px;
  cursor: pointer;
  transition: color 160ms, border-color 160ms, background 160ms;
}

.ai-topbar__reset:hover {
  color: var(--color-text);
  border-color: var(--color-border-strong);
  background: var(--color-surface);
}

.ai-messages {
  flex: 1;
  overflow-y: auto;
  padding: 12px 20px 28px;
  scroll-behavior: smooth;
}

.ai-messages--empty {
  display: flex;
  align-items: center;
  justify-content: center;
}

.welcome {
  width: min(640px, 100%);
  margin: 0 auto;
  text-align: center;
  padding: 24px 4px 36px;
}

.welcome__mark {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  margin: 0 auto 20px;
  border-radius: var(--radius-lg);
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface));
  color: var(--color-primary);
  font-size: 16px;
  font-weight: 600;
  font-family: var(--font-ui);
  box-shadow: var(--shadow-sm);
}

.welcome__title {
  margin: 0;
  font-size: 26px;
  font-weight: 600;
  letter-spacing: -0.03em;
  color: var(--color-text);
  text-wrap: pretty;
  font-family: var(--font-ui);
}

.welcome__sub {
  margin: 12px 0 0;
  font-size: 14.5px;
  line-height: 1.55;
  color: var(--color-text-muted);
}

.welcome__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 32px;
  text-align: left;
}

.prompt-card {
  display: flex;
  flex-direction: column;
  gap: 5px;
  padding: 13px 14px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  color: var(--color-text);
  cursor: pointer;
  transition: border-color 160ms, background 160ms, box-shadow 160ms;
}

.prompt-card:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
  box-shadow: var(--shadow-sm);
}

.prompt-card:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.prompt-card__label {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--color-primary);
}

.prompt-card__text {
  font-size: 13px;
  line-height: 1.45;
  color: var(--color-text);
}

.msg-list {
  max-width: 720px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 28px;
  padding: 8px 0 16px;
}

.msg {
  animation: fadein 260ms ease-out;
}

@keyframes fadein {
  from { opacity: 0; transform: translateY(5px); }
  to   { opacity: 1; transform: translateY(0); }
}

.msg--user {
  display: flex;
  justify-content: flex-end;
}

.msg__user-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 8px;
  max-width: min(72%, 480px);
}

.msg__atts {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}

.msg__att {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 10px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  font-size: 12px;
  color: var(--color-text-muted);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.msg__bubble {
  padding: 10px 16px;
  border-radius: var(--radius-lg) var(--radius-lg) var(--radius-sm) var(--radius-lg);
  background: color-mix(in srgb, var(--color-primary) 10%, var(--color-surface));
  color: var(--color-text);
  font-size: 15px;
  line-height: 1.55;
  word-break: break-word;
  border: 1px solid color-mix(in srgb, var(--color-primary) 16%, var(--color-border));
  white-space: pre-wrap;
}

.msg--assistant {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}

.msg__avatar {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  margin-top: 3px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--color-primary) 12%, var(--color-surface));
  color: var(--color-primary);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
  font-family: var(--font-ui);
}

.msg__avatar--pulse {
  animation: pulse-soft 1.4s ease-in-out infinite;
}

@keyframes pulse-soft {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}

.msg__stack {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 2px;
}

.msg__body {
  font-size: 15px;
  line-height: 1.75;
  color: var(--color-text);
  word-break: break-word;
  text-wrap: pretty;
  letter-spacing: -0.01em;
}

.msg__body :deep(.md-p) { margin: 0 0 0.85em; }
.msg__body :deep(.md-p:last-child) { margin-bottom: 0; }
.msg__body :deep(.md-h) {
  margin: 1.1em 0 0.45em;
  font-weight: 600;
  letter-spacing: -0.02em;
  color: var(--color-text);
  line-height: 1.35;
}
.msg__body :deep(.md-h1) { font-size: 1.2em; }
.msg__body :deep(.md-h2) { font-size: 1.1em; }
.msg__body :deep(.md-h3) { font-size: 1.02em; }
.msg__body :deep(.md-ul),
.msg__body :deep(.md-ol) {
  margin: 0.35em 0 0.9em;
  padding-left: 1.25em;
}
.msg__body :deep(.md-li) { margin: 0.28em 0; }
.msg__body :deep(.md-li::marker) { color: var(--color-text-subtle); }
.msg__body :deep(.md-quote) {
  margin: 0.55em 0 0.95em;
  padding: 0.35em 0 0.35em 0.9em;
  border-left: 2px solid color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
  color: var(--color-text-muted);
}
.msg__body :deep(.md-pre) {
  margin: 0.55em 0 1em;
  padding: 12px 14px;
  border-radius: var(--radius-md);
  background: var(--ink-900);
  color: var(--parchment-100);
  overflow-x: auto;
  border: 1px solid var(--ink-700);
}
.msg__body :deep(.md-codeblock) {
  font-family: var(--font-mono), monospace;
  font-size: 12.5px;
  line-height: 1.6;
  white-space: pre;
}
.msg__body :deep(.md-code) {
  padding: 1px 5px;
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--color-surface) 70%, var(--parchment-300));
  font-family: var(--font-mono), monospace;
  font-size: 0.9em;
}
.msg__body :deep(strong) { font-weight: 600; }
.msg__body :deep(.md-hr) {
  border: none;
  border-top: 1px solid var(--color-border);
  margin: 1em 0;
}
.msg__body :deep(.md-link) {
  color: var(--color-secondary);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.cursor {
  display: inline-block;
  width: 2px;
  height: 1em;
  margin-left: 2px;
  vertical-align: text-bottom;
  background: var(--color-text);
  animation: blink 1s step-end infinite;
}

@keyframes blink {
  50% { opacity: 0; }
}

.thought {
  margin: 0;
  max-width: 40rem;
}

.thought__toggle {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 2px 0;
  border: none;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  cursor: pointer;
  user-select: none;
}

.thought__toggle--static {
  cursor: default;
}

.thought__toggle:hover {
  color: var(--color-text);
}

.thought__chevron {
  flex-shrink: 0;
  opacity: 0.7;
  transition: transform 180ms ease;
}

.thought--open .thought__chevron {
  transform: rotate(90deg);
}

.thought__label--live {
  display: inline-flex;
  align-items: center;
}

.thought__shimmer {
  background: linear-gradient(
    90deg,
    var(--color-text-muted) 0%,
    var(--color-text) 45%,
    var(--color-text-muted) 90%
  );
  background-size: 200% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: thought-shimmer 1.8s ease-in-out infinite;
}

@keyframes thought-shimmer {
  0% { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}

.thought__timer {
  margin-left: 8px;
  font-size: 12px;
  font-weight: 400;
  font-variant-numeric: tabular-nums;
  color: var(--color-text-subtle);
}

.thought__body {
  margin-top: 8px;
  padding: 10px 12px;
  border-radius: var(--radius-md);
  background: color-mix(in srgb, var(--parchment-300) 40%, var(--color-surface));
  animation: fadein 180ms ease-out;
}

.thought__p {
  margin: 0 0 0.65em;
  font-size: 13px;
  line-height: 1.65;
  color: var(--color-text-muted);
  font-style: normal;
  text-wrap: pretty;
}

.thought__p--plain {
  margin-top: 6px;
  padding: 0;
  font-style: normal;
}

.thought__p:last-child { margin-bottom: 0; }

.thought--live .thought__body {
  max-height: 200px;
  overflow: hidden;
  mask-image: linear-gradient(to bottom, #000 70%, transparent 100%);
}

.thought__cursor {
  display: inline-block;
  width: 0.4em;
  height: 0.85em;
  margin-left: 1px;
  vertical-align: text-bottom;
  background: var(--color-text-subtle);
  animation: blink 1s step-end infinite;
}

.tool-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tool-card {
  padding: 10px 12px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.tool-card__head {
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--color-text-muted);
}

.tool-card__name {
  font-size: 12px;
  color: var(--color-text);
  font-family: var(--font-mono), monospace;
}

.tool-card__status {
  margin-left: auto;
  font-size: 11px;
  color: var(--bamboo-green);
}

.tool-card--error .tool-card__status { color: var(--color-primary); }
.tool-card--running .tool-card__status { color: var(--color-secondary); }

.tool-card__summary {
  margin: 5px 0 0;
  font-size: 12.5px;
  line-height: 1.45;
  color: var(--color-text-muted);
}

.tool-card__task {
  margin-top: 4px;
  font-size: 11px;
  font-family: 'Cascadia Code', 'Menlo', 'Consolas', monospace;
  color: var(--color-text-subtle);
}

.tool-card__args-toggle {
  margin-top: 6px;
  padding: 0;
  border: none;
  background: none;
  font-size: 11.5px;
  color: var(--color-secondary);
  cursor: pointer;
}

.tool-card__args {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 6px;
}

.tool-card__arg {
  padding: 2px 7px;
  border-radius: 4px;
  background: color-mix(in srgb, var(--parchment-300) 55%, transparent);
  font-size: 11px;
  color: var(--color-text-muted);
  font-family: 'Cascadia Code', 'Menlo', 'Consolas', monospace;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-card__preview {
  margin: 8px 0 0;
  padding: 8px 10px;
  border-radius: var(--radius-md);
  background: var(--ink-900);
  color: var(--parchment-100);
  font-size: 11.5px;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.attach-row {
  max-width: 720px;
  margin: 0 auto 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.attach-chip {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 100%;
  padding: 6px 10px;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  font-size: 12px;
  color: var(--color-text-muted);
}

.attach-chip--reading { opacity: 0.75; }
.attach-chip--error {
  border-color: color-mix(in srgb, var(--color-primary) 35%, var(--color-border));
  color: var(--color-primary);
}

.attach-chip__name {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--color-text);
}

.attach-chip__err {
  max-width: 140px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.attach-chip__x {
  display: grid;
  place-items: center;
  border: none;
  background: transparent;
  color: inherit;
  cursor: pointer;
  padding: 0;
}

.mode-switch {
  display: flex;
  gap: 4px;
  max-width: 720px;
  margin: 0 auto 10px;
  padding: 3px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-surface) 88%, var(--color-border));
  border: 1px solid var(--color-border);
}

.mode-switch__btn {
  flex: 1;
  border: none;
  background: transparent;
  color: var(--color-text-muted, #667);
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.02em;
  padding: 7px 10px;
  border-radius: 999px;
  cursor: pointer;
}

.mode-switch__btn.is-active {
  background: var(--color-surface);
  color: var(--color-text);
  box-shadow: var(--shadow-sm);
}

.mode-switch__btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.role-select {
  margin-top: 8px;
}

.role-select__dropdown {
  width: 100%;
  max-width: 300px;
  padding: 6px 12px;
  border: 1px solid var(--color-border, #dcdfe6);
  border-radius: var(--radius-md, 8px);
  background: var(--color-surface, #fff);
  font-size: 13px;
  color: var(--color-text-primary, #303133);
  cursor: pointer;
  outline: none;
  transition: border-color 0.2s;
}

.role-select__dropdown:hover {
  border-color: var(--color-primary, #409eff);
}

.role-select__dropdown:focus {
  border-color: var(--color-primary, #409eff);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--color-primary) 20%, transparent);
}

.upgrade-hint {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 10px;
  padding: 10px 12px;
  border-radius: var(--radius-md, 8px);
  background: color-mix(in srgb, var(--color-primary) 8%, var(--color-surface));
  border: 1px solid color-mix(in srgb, var(--color-primary) 22%, var(--color-border));
  font-size: 13px;
}

.upgrade-hint__text {
  flex: 1;
  min-width: 160px;
  color: var(--color-text-muted, #556);
  line-height: 1.45;
}

.upgrade-hint__btn {
  border: none;
  border-radius: 999px;
  padding: 6px 12px;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  background: var(--color-primary);
  color: #fff;
}

.ai-composer {
  padding: 0 20px 22px;
  background: linear-gradient(to top, var(--color-background) 55%, transparent);
}

.ai-composer__box {
  max-width: 720px;
  margin: 0 auto;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
  transition: border-color 160ms, box-shadow 160ms;
}

.ai-composer__box:focus-within {
  border-color: color-mix(in srgb, var(--color-primary) 40%, var(--color-border));
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.ai-composer__box.is-disabled { opacity: 0.85; }

.ai-composer__input {
  display: block;
  width: 100%;
  min-height: 52px;
  max-height: 140px;
  resize: none;
  border: none;
  outline: none;
  background: transparent;
  padding: 16px 18px 4px;
  font: inherit;
  font-size: 15px;
  line-height: 1.55;
  color: var(--color-text);
  box-sizing: border-box;
}

.ai-composer__input::placeholder { color: var(--color-text-subtle); }

.ai-composer__bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 6px 10px 10px 10px;
}

.ai-composer__actions {
  display: flex;
  align-items: center;
  gap: 2px;
  min-width: 0;
}

.ai-composer__file {
  position: absolute;
  width: 0;
  height: 0;
  opacity: 0;
  pointer-events: none;
}

.icon-btn {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: var(--color-text-muted);
  cursor: pointer;
  transition: background 140ms, color 140ms;
}

.icon-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--parchment-300) 45%, transparent);
  color: var(--color-text);
}

.icon-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

.icon-btn.is-active {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.ai-composer__speech-err {
  font-size: 11px;
  color: var(--color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 140px;
}

.ai-composer__right {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.ai-composer__hint {
  font-size: 11px;
  color: var(--color-text-subtle);
}

.send-btn {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border: none;
  border-radius: var(--radius-md);
  background: var(--color-primary);
  color: #fff;
  cursor: pointer;
  transition: opacity 160ms, transform 160ms;
}

.send-btn:hover:not(:disabled) {
  opacity: 0.88;
  transform: translateY(-1px);
}

.send-btn:disabled {
  opacity: 0.22;
  cursor: not-allowed;
  transform: none;
}

@media (max-width: 860px) {
  .welcome__grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

@media (max-width: 640px) {
  .ai-topbar,
  .ai-messages,
  .ai-composer { padding-left: 12px; padding-right: 12px; }
  .welcome__title { font-size: 22px; }
  .welcome__grid { grid-template-columns: 1fr; }
  .msg__user-col { max-width: 88%; }
  .msg--assistant {
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 10px;
  }
  .ai-composer__hint { display: none; }
}

.expert-modal {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.expert-modal__overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
}

.expert-modal__content {
  position: relative;
  z-index: 1;
  width: 90%;
  max-width: 850px;
  max-height: 85vh;
  overflow: hidden;
  border-radius: 16px;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.selected-expert {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 8px 12px;
  background: color-mix(in srgb, var(--color-primary) 10%, white);
  border-radius: 8px;
  font-size: 13px;
}

.selected-expert__label {
  color: var(--color-text-secondary);
}

.selected-expert__name {
  font-weight: 500;
  color: var(--color-primary);
}

.selected-expert__change {
  margin-left: auto;
  padding: 4px 8px;
  border: 1px solid var(--color-border);
  border-radius: 4px;
  background: white;
  font-size: 12px;
  cursor: pointer;
}

.selected-expert__change:hover {
  background: var(--color-bg-page);
}
</style>
