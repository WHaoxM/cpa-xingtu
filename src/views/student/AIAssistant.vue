<!-- 页面：AI助手；路由：student/ai-assistant（student-ai-assistant）；角色：STUDENT -->
<script setup lang="ts">
import { ref, computed, nextTick, watch, onBeforeUnmount, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import { Attachments, Bubble, Conversations, Prompts, Thinking, Welcome, XSender } from 'vue-element-plus-x'
import { useLearningStore, useAgentChatStore, useUserStore } from '@/stores'
import { useResumeStore } from '@/stores/resume'
import { usePageEntrance } from '@/composables/usePageEntrance'
import { useChatAttachments } from '@/composables/useChatAttachments'
import { useSpeechInput } from '@/composables/useSpeechInput'
import { isCareerResourceUri, isPipelineTaskId } from '@/composables/useAgentResourceHandoff'
import { renderMarkdown } from '@/utils/markdown'
import { getApiMode } from '@/api/config'
import { getAgentSessionId } from '@/api/agent'
import { mountSessionResources } from '@/api/agentMedia'
import { getPipelineStatus, getPipelineEvents } from '@/api/pipeline'
import { toFriendlyApiError } from '@/api/types'
import { CURRENT_USER_ID } from '@/mock/data'
import type { AIMessage, AIToolCall } from '@/types'
import MessagePartsRenderer from '@/components/agent/MessagePartsRenderer.vue'
import AgentMark from '@/components/agent/AgentMark.vue'
import ExpertDirectory from '@/components/agent/ExpertDirectory.vue'
import { workspaceExperts, type WorkspaceExpert } from '@/components/agent/expertCatalog'

function resolveStudentId(): string {
  try {
    return useUserStore().currentUser?.id || CURRENT_USER_ID
  } catch {
    return CURRENT_USER_ID
  }
}

const { pageRef } = usePageEntrance()
const router = useRouter()
const route = useRoute()
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
const composerInputRef = ref<InstanceType<typeof XSender>>()
const loading = ref(false)
const sidebarOpen = ref(true)
const isInitialState = computed(() => messages.value.length === 0)
const isHttpMode = computed(() => getApiMode() === 'http')
const pendingTaskRef = ref<{ task_id: string; pipeline: string; status: string } | null>(null)
const taskRefError = ref('')
const pendingResourceUri = computed(() => isHttpMode.value && isCareerResourceUri(route.query.resource_uri)
  ? route.query.resource_uri as string : '')
const resourceRefError = computed(() => route.query.resource_uri && !pendingResourceUri.value
  ? '无效的业务资料引用' : '')
let taskRefLoadSeq = 0
watch(() => route.query.task_id, async raw => {
  const seq = ++taskRefLoadSeq
  pendingTaskRef.value = null
  taskRefError.value = ''
  if (!isHttpMode.value || typeof raw !== 'string') return
  if (!isPipelineTaskId(raw)) {
    taskRefError.value = '无效的任务引用'
    return
  }
  try {
    const env = await getPipelineEvents(raw)
    if (seq !== taskRefLoadSeq) return
    if (!env.success || !env.data?.task) throw new Error(env.error || '任务引用不可用')
    pendingTaskRef.value = env.data.task
  } catch (e) {
    if (seq !== taskRefLoadSeq) return
    taskRefError.value = e instanceof Error ? e.message : '任务引用不可用'
  }
}, { immediate: true })

onMounted(async () => {
  await agentChat.bootstrap()
  const requestedSession = typeof route.query.session_id === 'string' ? route.query.session_id : ''
  if (requestedSession && agentChat.conversations.some(c => c.sessionId === requestedSession)) {
    await onSelectConversation(requestedSession)
  }
  if (window.matchMedia('(max-width: 760px)').matches) sidebarOpen.value = false
})

/** Transport modes remain available, but task intent leads the UI rather than technical labels. */
type InteractionMode = 'ask' | 'agent' | 'experts'
const interactionMode = ref<InteractionMode>('agent')
const modeOptions: { id: InteractionMode; label: string; tip: string }[] = [
  { id: 'agent', label: '自动处理', tip: '可使用工作台能力完成任务' },
  { id: 'ask', label: '直接回答', tip: '适合不需要工具的简单问题' },
  { id: 'experts', label: '协作处理', tip: '适合需要多视角的复杂任务' },
]
const workspaceView = ref<'chat' | 'experts'>('chat')
const selectedExpert = ref<WorkspaceExpert | null>(null)
const composerMenuOpen = ref(false)
const composerMenuSection = ref<'main' | 'experts' | 'mode'>('main')
const expertSearch = ref('')
const quickExperts = computed(() => workspaceExperts.filter(expert =>
  !expertSearch.value.trim() || [expert.name, expert.byline, ...expert.tags]
    .some(value => value.toLocaleLowerCase().includes(expertSearch.value.trim().toLocaleLowerCase()))
))

function toggleComposerMenu() {
  composerMenuOpen.value = !composerMenuOpen.value
  composerMenuSection.value = 'main'
  expertSearch.value = ''
}

function openModeMenu() {
  composerMenuOpen.value = true
  composerMenuSection.value = 'mode'
}

function closeComposerMenu() {
  composerMenuOpen.value = false
  composerMenuSection.value = 'main'
}

function openExpertDirectory() {
  if (loading.value) return
  closeComposerMenu()
  workspaceView.value = 'experts'
  if (window.matchMedia('(max-width: 760px)').matches) sidebarOpen.value = false
}

function chooseExpert(expert: WorkspaceExpert, prompt?: string) {
  if (loading.value) return
  selectedExpert.value = expert
  interactionMode.value = 'experts'
  const draft = inputMessage.value.trim()
  const starter = prompt || expert.prompts[0] || `请从${expert.name}的视角帮我梳理这个任务。`
  inputMessage.value = draft ? `${draft}\n\n${prompt || `请从${expert.name}的视角给出建议。`}` : starter
  closeComposerMenu()
  workspaceView.value = 'chat'
  void nextTick(() => composerInputRef.value?.focus())
}

async function summonExpert(expert: WorkspaceExpert, prompt?: string) {
  if (loading.value) return
  // Keep the current draft, files, and session. The visible prompt—not a hidden role ID—is the input.
  chooseExpert(expert, prompt)
}

function setInteractionMode(mode: InteractionMode) {
  interactionMode.value = mode
  if (mode !== 'experts') selectedExpert.value = null
}

function removeSelectedExpert() {
  selectedExpert.value = null
  interactionMode.value = 'agent'
}

function applyUpgradeHint(to?: string) {
  if (to === 'ask' || to === 'agent' || to === 'experts') {
    setInteractionMode(to)
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
  { label: '职业方向', text: '帮我分析适合的职业方向' },
  { label: '能力画像', text: '查看我的能力画像' },
  { label: '学习计划', text: '制定本周学习计划' },
  { label: '技能自评', text: '做一次技能自评' },
  { label: '岗位匹配', text: '我和目标岗位差距有多大？' },
]
const promptItems = [
  ...quickPrompts.map(prompt => ({
    key: prompt.label,
    label: prompt.label,
    itemStyle: { background: 'var(--color-surface)', border: '1px solid var(--color-border)', borderRadius: 'var(--radius-pill)' },
    itemHoverStyle: { background: 'var(--chat-rail-bg)', borderColor: 'var(--color-primary)' },
  })),
  {
    key: 'explore-experts',
    label: '探索专家',
    itemStyle: { background: 'var(--color-surface)', border: '1px solid var(--color-primary)', borderRadius: 'var(--radius-pill)' },
    itemHoverStyle: { background: 'var(--chat-rail-bg)', borderColor: 'var(--color-primary)' },
  },
]

const conversationItems = computed(() => agentChat.sidebarItems.map(conversation => ({
  ...conversation,
  id: conversation.sessionId,
  label: conversation.title || '新对话',
  disabled: loading.value || agentChat.switching,
})))

const attachmentCards = computed(() => attachments.value.map(attachment => ({
  uid: attachment.id,
  name: attachment.name,
  fileSize: attachment.size,
  status: attachment.status === 'ready' ? 'done' as const : attachment.status === 'error' ? 'error' as const : 'uploading' as const,
  errorTip: attachment.error,
  showDelIcon: true,
})))

watch(inputMessage, async text => {
  await nextTick()
  const sender = composerInputRef.value
  if (sender && sender.getModelValue().text !== text) sender.setText(text)
})

function onSenderChange() {
  inputMessage.value = composerInputRef.value?.getModelValue().text || ''
}

function onSenderSubmit() {
  const text = composerInputRef.value?.getModelValue().text || ''
  if ((!text.trim() && !readyFileIds().length && !pendingTaskRef.value) || loading.value || attachmentsBusy.value) return
  void sendMessage(text)
  composerInputRef.value?.clear()
  inputMessage.value = ''
}

function onPromptClick(item: { key: string | number }) {
  if (item.key === 'explore-experts') { openExpertDirectory(); return }
  const prompt = quickPrompts.find(candidate => candidate.label === item.key)
  if (prompt) void prepareTask(prompt.text)
}

function onConversationChange(item: { sessionId?: string }) {
  if (item.sessionId) void onSelectConversation(item.sessionId)
}

function onConversationMenuCommand(command: string | number | object, item: { sessionId?: string }) {
  if (command === 'delete' && item.sessionId) void onDeleteConversation(item.sessionId)
}

function onAttachmentDelete(item: { uid?: string | number }) {
  if (item.uid != null) removeAttachment(String(item.uid))
}

async function prepareTask(prompt: string) {
  inputMessage.value = prompt
  await nextTick()
  composerInputRef.value?.focus('mark')
}

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

function startTaskPolls(msgId: string, tools: AIToolCall[] | undefined, runId: string) {
  if (!tools?.length) return
  tools.forEach((tool, i) => {
    if (tool.taskId === runId) {
      tool.status = 'running'
      pollPipelineTask(msgId, i, tool.taskId)
    }
  })
}

async function sendMessage(preset?: string) {
  const userMsg = (preset ?? inputMessage.value).trim()
  const fileIds = readyFileIds()
  const taskRef = pendingTaskRef.value
  const resourceUri = pendingResourceUri.value
  if ((!userMsg && !fileIds.length && !taskRef && !resourceUri) || loading.value || attachmentsBusy.value) return

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
    ...(taskRef ? [{ type: 'artifact_ref', task_id: taskRef.task_id }] : []),
    ...(resourceUri ? [{ type: 'resource_ref', uri: resourceUri }] : []),
  ]

  try {
    await agentChat.ensureActiveSession()
  } catch (e) {
    console.warn('[ai] ensure session failed', e)
  }

  const now = new Date().toISOString().replace('T', ' ').substring(0, 16)
  agentChat.addMessage({
    role: 'user',
    content: userMsg || (taskRef ? `（已引用任务 ${taskRef.task_id}）` : resourceUri ? '（已引用当前业务资料）' : `（已附带 ${fileIds.length} 个附件）`),
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
      })
      lastVoiceTurnId.value = null
      voiceBoundText.value = ''
      clearAttachments()
      if (taskRef || resourceUri) {
        pendingTaskRef.value = null
        void router.replace({ query: { ...route.query, task_id: undefined, resource_uri: undefined } })
      }
      stopProcessingWait()

      // HTTP JSON 已携带完整结果：只展示真实耗时和原文，不伪装成增量流。
      const prose = formatThinkingProse(result.thinking)
      const duration = result.elapsedSeconds
      const tools = (result.toolCalls || []).map(t => ({ ...t }))

      const aiMsg = agentChat.addMessage({
        role: 'assistant',
        content: result.content,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 16),
        thinking: prose,
        thinkingDuration: duration,
        status: 'done',
        toolCalls: tools,
        parts: result.parts,
        artifacts: result.artifacts,
        turnId: result.turnId,
        outcome: result.outcome,
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

      // 只有后端明确给出仍在运行的 run_id，才开始轮询该权威任务。
      if (result.outcome?.status === 'running' && result.outcome.run_id) {
        startTaskPolls(aiMsg.id, tools, result.outcome.run_id)
      }
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
    selectedExpert.value = null
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
  selectedExpert.value = null
  interactionMode.value = 'agent'
  workspaceView.value = 'chat'
  closeComposerMenu()
  inputMessage.value = ''
  clearAttachments()
  // New backend session = fresh STM; previous thread stays in sidebar
  await agentChat.startNewConversation()
  if (window.matchMedia('(max-width: 760px)').matches) sidebarOpen.value = false
}

async function onSelectConversation(sessionId: string) {
  if (loading.value) return
  if (sessionId === agentChat.activeSessionId) {
    workspaceView.value = 'chat'
    closeComposerMenu()
    if (window.matchMedia('(max-width: 760px)').matches) sidebarOpen.value = false
    return
  }
  clearAllTimers()
  stopAllPolls()
  streamingMsgId.value = null
  isThinking.value = false
  isProcessing.value = false
  thinkingStreamText.value = ''
  expandedThinkingIds.value = new Set()
  selectedExpert.value = null
  interactionMode.value = 'agent'
  workspaceView.value = 'chat'
  closeComposerMenu()
  inputMessage.value = ''
  await agentChat.switchSession(sessionId)
  if (window.matchMedia('(max-width: 760px)').matches) sidebarOpen.value = false
  await nextTick()
  scrollToBottom()
}

async function onDeleteConversation(sessionId: string, e?: Event) {
  e?.stopPropagation()
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

function openFilePicker() {
  fileInputRef.value?.click()
}

async function uploadSelectedFiles(files: FileList | File[]) {
  if (!files.length) return
  try {
    await agentChat.ensureActiveSession()
  } catch (err) {
    console.warn('[ai] ensure session before upload failed', err)
  }
  await addFiles(files, {
    sessionId: getAgentSessionId(),
    studentId: resolveStudentId(),
  })
}

async function onFilesSelected(e: Event) {
  const input = e.target as HTMLInputElement
  if (!input.files?.length) return
  await uploadSelectedFiles(input.files)
  input.value = ''
}

function onPastedFiles(_firstFile: File, files: FileList) {
  void uploadSelectedFiles(files)
}

function toolStatusLabel(tool: AIToolCall): string {
  if (tool.status === 'running') return tool.taskStatus ? `运行中 · ${tool.taskStatus}` : '运行中'
  if (tool.status === 'error') return '失败'
  if (tool.status === 'needs_input') return '待用户确认'
  if (tool.status === 'partial') return '部分完成'
  if (tool.status === 'unknown') return '待核验'
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
        <button type="button" class="ai-rail__brand" aria-label="返回职导星图首页" @click="router.push('/app/dashboard')">
          <AgentMark :size="28" /><span><strong>职导星图</strong><small>Agent 工作台</small></span><Icon icon="lucide:arrow-up-right" :width="14" />
        </button>
        <div class="ai-rail__head">
          <button type="button" class="ai-rail__new" :disabled="loading" @click="clearChat">
            <Icon icon="lucide:plus" :width="14" />
            <span>新任务</span>
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
        <nav class="ai-rail__nav" aria-label="工作台导航">
          <button type="button" :disabled="loading" :class="{ 'is-active': workspaceView === 'chat' }" @click="workspaceView = 'chat'; closeComposerMenu()"><Icon icon="lucide:message-square" :width="16" />对话</button>
          <button type="button" :disabled="loading" :class="{ 'is-active': workspaceView === 'experts' }" @click="openExpertDirectory"><Icon icon="lucide:users-round" :width="16" />专家与协作组</button>
        </nav>
        <span class="ai-rail__section-label">最近任务</span>
        <div class="ai-rail__list">
          <Conversations
            v-if="conversationItems.length"
            class="ai-rail__conversations"
            :items="conversationItems"
            :active="agentChat.activeSessionId || undefined"
            row-key="sessionId"
            label-key="label"
            :style="{ width: '100%', height: '100%', backgroundColor: 'var(--chat-rail-bg)', boxShadow: 'none', padding: '0' }"
            :items-style="{ margin: '0 4px', padding: '9px 10px' }"
            :items-hover-style="{ backgroundColor: 'var(--color-surface)' }"
            :items-active-style="{ backgroundColor: 'color-mix(in srgb, var(--color-primary) 10%, var(--color-surface))' }"
            :menu="[{ key: 'delete', label: '删除会话', command: 'delete', disabled: loading }]"
            show-built-in-menu
            :show-tooltip="true"
            @change="onConversationChange"
            @menu-command="onConversationMenuCommand"
          >
            <template #label="{ item }">
              <span class="ai-rail__item-main">
                <span class="ai-rail__title">{{ item.label }}</span>
                <span class="ai-rail__time">{{ formatSessionTime(item.updatedAt) }}</span>
              </span>
            </template>
          </Conversations>
          <p v-if="!agentChat.sidebarItems.length" class="ai-rail__empty">暂无历史会话</p>
        </div>
      </aside>

      <button
        v-if="sidebarOpen"
        type="button"
        class="ai-rail-backdrop"
        aria-label="关闭会话栏"
        @click="sidebarOpen = false"
      />

      <div class="ai-main" :class="{ 'ai-main--empty': workspaceView === 'chat' && isInitialState }">
      <header class="ai-topbar ai-topbar--chat">
        <button type="button" class="ai-topbar__home" title="返回首页" aria-label="返回首页" @click="router.push('/app/dashboard')"><Icon icon="lucide:arrow-left" :width="17" /></button>
        <button
          v-if="!sidebarOpen"
          type="button"
          class="ai-topbar__reset"
          aria-label="打开会话栏"
          @click="sidebarOpen = true"
        >
          <Icon icon="lucide:panel-left" :width="14" />
          <span>会话</span>
        </button>
        <div class="ai-topbar__identity">
          <AgentMark :size="25" class="ai-topbar__mark" />
          <div class="ai-topbar__identity-copy">
          <strong>{{ workspaceView === 'experts' ? '专家目录' : '星图 Agent' }}</strong>
          <span>{{ workspaceView === 'experts' ? '选择任务视角' : '对话 · 任务 · 成果' }}</span>
          </div>
        </div>
        <div class="ai-topbar__spacer" />
        <button
          type="button"
          class="ai-topbar__reset ai-topbar__reset--new"
          :disabled="loading"
          @click="clearChat"
        >
          <Icon icon="lucide:plus" :width="14" />
          <span>新任务</span>
        </button>
      </header>

      <ExpertDirectory v-if="workspaceView === 'experts'" @summon="summonExpert" />

      <template v-else>

      <div ref="messagesContainer" class="ai-messages" :class="{ 'ai-messages--empty': isInitialState }">
        <template v-if="isInitialState">
          <div class="welcome">
            <Welcome
              class="welcome__component"
              variant="borderless"
              title="今天想完成什么？"
              description="提问、上传材料，或选择专家视角来组织一项任务。"
              :style="{ '--elx-welcome-filled-bg': 'transparent', '--elx-welcome-title-color': 'var(--color-text)', '--elx-welcome-description-color': 'var(--color-text-muted)' }"
            />
            <div class="welcome__shortcuts" aria-label="快捷任务">
              <Prompts
                class="welcome__prompts"
                :items="promptItems"
                :wrap="true"
                @item-click="onPromptClick"
              >
                <template #icon="{ item }"><Icon :icon="item.key === 'explore-experts' ? 'lucide:users-round' : 'lucide:arrow-up-right'" :width="13" /></template>
              </Prompts>
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
                  <Bubble class="ai-bubble ai-bubble--user" placement="end" variant="filled" shape="corner" avatar-size="0px" avatar-gap="0px" max-width="100%">
                    <template #content><span class="msg__bubble-text">{{ displayUserContent(msg) }}</span></template>
                  </Bubble>
                </div>
              </div>

              <div v-else class="msg msg--assistant msg--assistant-bubble">
                <Bubble class="ai-bubble ai-bubble--assistant" placement="start" no-style max-width="100%">
                  <template #avatar><AgentMark :size="28" /></template>
                  <template #content>
                    <div class="msg__stack">
                      <MessagePartsRenderer
                        :message="msg"
                        :session-id="agentChat.activeSessionId"
                        :is-streaming="msg.id === streamingMsgId"
                        :streaming-text="streamingContent"
                        @upgrade="applyUpgradeHint"
                      />
                      <span v-if="msg.id === streamingMsgId" class="cursor" aria-hidden="true" />
                    </div>
                  </template>
                </Bubble>
              </div>
            </template>

            <!-- mock 思考独白 -->
            <div v-if="isThinking" class="msg msg--assistant">
              <AgentMark :size="28" class="msg__avatar--pulse" />
              <div class="msg__stack">
                <Thinking v-model="liveThinkingOpen" class="ai-thinking" status="thinking" :auto-collapse="false" :content="thinkingStreamText">
                  <template #label><span class="thought__shimmer">正在思考 · {{ thinkingElapsed }}s</span></template>
                  <template #content>
                    <p v-for="(para, pi) in thinkingStreamText.split('\n\n').filter(Boolean)" :key="`live-t-${pi}`" class="thought__p">{{ para }}</p>
                    <span class="thought__cursor" aria-hidden="true" />
                  </template>
                </Thinking>
              </div>
            </div>

            <!-- http 处理中 -->
            <div v-if="isProcessing" class="msg msg--assistant">
              <AgentMark :size="28" class="msg__avatar--pulse" />
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

      <div class="ai-composer" @keydown.esc="closeComposerMenu">
        <div v-if="selectedExpert" class="selected-expert">
          <Icon :icon="selectedExpert.icon" :width="15" />
          <span>{{ selectedExpert.name }}</span>
          <small>已写入任务说明，可继续编辑</small>
          <button type="button" aria-label="移除专家视角标记" title="移除标记并返回自动处理；已编辑的文字会保留" @click="removeSelectedExpert"><Icon icon="lucide:x" :width="14" /></button>
        </div>
        <Attachments
          v-if="attachmentCards.length"
          class="ai-attachments"
          :items="attachmentCards"
          overflow="scrollX"
          :hide-upload="true"
          @delete-card="onAttachmentDelete"
        />

        <div class="ai-composer__box" :class="{ 'is-disabled': loading }">
          <p v-if="pendingTaskRef" class="ai-task-reference">已核验任务引用：{{ pendingTaskRef.pipeline }} · {{ pendingTaskRef.task_id }} · {{ pendingTaskRef.status }}（发送时由服务端再次核验）</p>
          <p v-if="taskRefError" class="ai-task-reference">任务引用不可用：{{ taskRefError }}</p>
          <p v-if="pendingResourceUri" class="ai-task-reference">已选中业务资料：{{ pendingResourceUri }}（发送时由服务端按当前身份读取，不传页面内容）</p>
          <p v-if="resourceRefError" class="ai-task-reference">业务资料引用不可用：{{ resourceRefError }}</p>
          <XSender
            ref="composerInputRef"
            class="ai-composer__sender"
            variant="updown"
            submit-type="enter"
            :placeholder="loading ? '正在整理回复…' : '描述你的问题，Enter 发送 · Shift+Enter 换行'"
            :disabled="loading"
            :loading="loading"
            :auto-focus="false"
            @change="onSenderChange"
            @submit="onSenderSubmit"
            @paste-file="onPastedFiles"
          >
            <template #prefix>
              <div class="ai-composer__actions">
              <input
                ref="fileInputRef"
                type="file"
                class="ai-composer__file"
                multiple
                accept=".txt,.md,.json,.csv,.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
                @change="onFilesSelected"
              >
              <button type="button" class="icon-btn icon-btn--plus" title="添加到任务" aria-label="添加到任务" :aria-expanded="composerMenuOpen" :disabled="loading" @click="toggleComposerMenu">
                <Icon :icon="composerMenuOpen ? 'lucide:x' : 'lucide:plus'" :width="18" />
              </button>
              <button type="button" class="icon-btn" title="上传附件" aria-label="上传附件" :disabled="loading" @click="openFilePicker"><Icon icon="lucide:paperclip" :width="16" /></button>
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
            </template>
            <template #action-list>
              <div class="ai-composer__right">
              <button type="button" class="composer-mode" :aria-expanded="composerMenuOpen && composerMenuSection === 'mode'" :title="modeOptions.find(opt => opt.id === interactionMode)?.tip" :disabled="loading" @click="openModeMenu">
                <Icon :icon="interactionMode === 'experts' ? 'lucide:users-round' : interactionMode === 'ask' ? 'lucide:message-circle' : 'lucide:sparkles'" :width="15" />
                {{ modeOptions.find(opt => opt.id === interactionMode)?.label }}
                <Icon icon="lucide:chevron-down" :width="13" />
              </button>
              <button
                type="button"
                class="send-btn"
                :disabled="(!inputMessage.trim() && !readyFileIds().length && !pendingTaskRef) || loading || attachmentsBusy"
                aria-label="发送"
                @click="onSenderSubmit"
              >
                <Icon icon="lucide:arrow-up" :width="16" />
              </button>
              </div>
            </template>
          </XSender>
        </div>
        <button v-if="composerMenuOpen" type="button" class="composer-menu-backdrop" aria-label="关闭添加菜单" @click="closeComposerMenu" />
        <div v-if="composerMenuOpen" class="composer-menu" :class="{ 'composer-menu--wide': composerMenuSection === 'experts', 'composer-menu--mode': composerMenuSection === 'mode' }">
          <template v-if="composerMenuSection === 'main'">
            <span class="composer-menu__label">添加到任务</span>
            <button type="button" @click="closeComposerMenu(); openFilePicker()"><Icon icon="lucide:paperclip" :width="16" />添加文件</button>
            <button type="button" @click="composerMenuSection = 'mode'"><Icon icon="lucide:sparkles" :width="16" />切换模式<Icon class="composer-menu__chevron" icon="lucide:chevron-right" :width="14" /></button>
            <button type="button" @click="composerMenuSection = 'experts'"><Icon icon="lucide:users-round" :width="16" />选择专家<Icon class="composer-menu__chevron" icon="lucide:chevron-right" :width="14" /></button>
          </template>
          <template v-else-if="composerMenuSection === 'mode'">
            <button type="button" class="composer-menu__back" @click="composerMenuSection = 'main'"><Icon icon="lucide:arrow-left" :width="15" />模式</button>
            <button v-for="opt in modeOptions" :key="opt.id" type="button" class="composer-menu__mode-option" @click="setInteractionMode(opt.id); closeComposerMenu()"><Icon icon="lucide:check" :width="14" :class="{ 'is-hidden': interactionMode !== opt.id }" /><span><strong>{{ opt.label }}</strong><small>{{ opt.tip }}</small></span></button>
          </template>
          <template v-else>
            <button type="button" class="composer-menu__back" @click="composerMenuSection = 'main'"><Icon icon="lucide:arrow-left" :width="15" />选择专家</button>
            <label class="composer-menu__search"><Icon icon="lucide:search" :width="15" /><input v-model="expertSearch" type="search" aria-label="搜索专家" placeholder="搜索专家" /></label>
            <div class="composer-menu__results"><button v-for="expert in quickExperts" :key="expert.id" type="button" @click="chooseExpert(expert)"><Icon :icon="expert.icon" :width="17" />{{ expert.name }}<small>{{ expert.byline }}</small></button><p v-if="!quickExperts.length">没有匹配的专家</p></div>
            <button type="button" class="composer-menu__all" @click="openExpertDirectory"><Icon icon="lucide:arrow-up-right" :width="15" />浏览全部专家</button>
          </template>
        </div>
      </div>
      </template>
      </div>
    </div>
  </div>
</template>

<style scoped>
.ai-page {
  height: 100vh;
  height: 100dvh;
  padding: 0 !important;
}

.ai-shell {
  position: relative;
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
  background: var(--chat-rail-bg);
  min-height: 0;
}

.ai-rail__brand { display: flex; align-items: center; gap: 9px; width: 100%; padding: 17px 15px 11px; border: 0; background: transparent; color: var(--color-text); text-align: left; cursor: pointer; }
.ai-rail__brand > span:nth-child(2) { display: flex; flex: 1; flex-direction: column; gap: 2px; min-width: 0; }
.ai-rail__brand strong { font-size: 13px; font-weight: 700; }
.ai-rail__brand small { font-size: 10px; color: var(--color-text-muted); }
.ai-rail__brand > svg { color: var(--color-text-muted); }
.ai-rail__brand:hover strong { color: var(--color-primary); }

.ai-rail__head {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 12px 10px;
}

.ai-rail__nav { display: grid; gap: 3px; padding: 5px 9px 16px; border-bottom: 1px solid var(--color-border); }
.ai-rail__nav button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 9px 11px; border: 0; border-radius: 9px; background: transparent; color: var(--color-text-muted); text-align: left; font: inherit; font-size: 12px; cursor: pointer; }
.ai-rail__nav button:hover, .ai-rail__nav button.is-active { background: color-mix(in srgb, var(--color-primary) 9%, var(--color-surface)); color: var(--color-text); }
.ai-rail__nav button.is-active { font-weight: 700; }
.ai-rail__nav button:disabled { opacity: .5; cursor: not-allowed; }
.ai-rail__section-label { padding: 17px 17px 5px; color: var(--color-text-muted); font-size: 10px; font-weight: 700; letter-spacing: .07em; }

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

.ai-rail__conversations { width: 100%; min-height: 0; box-shadow: none; }
.ai-rail__conversations :deep(.elx-conversations-item) { width: calc(100% - 8px); box-sizing: border-box; }
.ai-rail__conversations :deep(.elx-conversations-item__content) { height: auto; min-height: 30px; }
.ai-rail__conversations :deep(.elx-conversations-item__label-container) { min-width: 0; }
.ai-rail__conversations :deep(.elx-conversations-item__menu) { color: var(--color-text-muted); }

.ai-rail__item {
  display: flex;
  align-items: center;
  gap: 6px;
  width: 100%;
  padding: 2px 4px;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  background: transparent;
  color: var(--color-text);
  text-align: left;
}

.ai-rail__open {
  flex: 1;
  min-width: 0;
  display: flex;
  padding: 8px 6px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}

.ai-rail__open:disabled { cursor: not-allowed; }
.ai-rail__open:focus-visible,
.ai-rail__delete:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }

.ai-rail-backdrop { display: none; }

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
.ai-rail__item.is-active .ai-rail__delete,
.ai-rail__delete:focus-visible {
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
  padding: 14px 24px;
  width: 100%;
  border-bottom: 1px solid var(--color-border);
  background: var(--color-surface);
  box-sizing: border-box;
  min-height: 12px;
}

.ai-topbar--chat {
  min-height: 52px;
}
.ai-topbar__home { display: none; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 7px; background: transparent; color: var(--color-text-muted); cursor: pointer; }
.ai-topbar__home:hover { background: var(--chat-rail-bg); color: var(--color-text); }

.ai-topbar__identity { display: flex; align-items: center; gap: 9px; }
.ai-topbar__identity-copy { display: flex; flex-direction: column; gap: 2px; }
.ai-topbar__identity strong { font-size: 13px; color: var(--color-text); }
.ai-topbar__identity span { font-size: 11px; color: var(--color-text-muted); }
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
.ai-topbar__reset--new { display: none; }

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

.ai-main--empty .ai-messages { flex: 0 0 auto; overflow: visible; width: 100%; margin-top: auto; padding-bottom: 0; box-sizing: border-box; }
.ai-main--empty .ai-composer { width: 100%; margin-bottom: auto; padding-top: 0; box-sizing: border-box; }
.ai-main--empty .ai-composer__box { max-width: 800px; }
.ai-main--empty .ai-composer__input { min-height: 94px; }

.welcome {
  width: min(760px, 100%);
  margin: 0 auto;
  text-align: center;
  padding: 24px 4px 36px;
}

.welcome__component { display: block; text-align: center; padding: 0; }
.welcome__component :deep(.elx-welcome__title) { font: 600 26px/1.3 var(--font-ui); letter-spacing: -0.03em; }
.welcome__component :deep(.elx-welcome__description) { margin-top: 7px; font-size: 14.5px; line-height: 1.55; }
.welcome__prompts :deep(.elx-prompts__items) { gap: 8px; justify-content: center; overflow: visible; }
.welcome__prompts :deep(.elx-prompts__item) { height: auto; min-height: 34px; padding: 7px 12px; }
.welcome__prompts :deep(.elx-prompts__item-content-container) { flex-direction: row; align-items: center; gap: 6px; }
.welcome__prompts :deep(.elx-prompts__item-label) { color: var(--color-text-muted); font: 500 11px/1.4 var(--font-ui); }
.welcome__prompts :deep(.elx-prompts__item-icon) { color: var(--color-text-muted); }
.welcome__prompts :deep(.elx-prompts__item:last-child .elx-prompts__item-label),
.welcome__prompts :deep(.elx-prompts__item:last-child .elx-prompts__item-icon) { color: var(--color-primary); }
.welcome__prompts :deep(.elx-prompts__item:hover .elx-prompts__item-label) { color: var(--color-text); }

.welcome__shortcuts { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin: 25px auto 18px; }
.welcome__shortcut { display: inline-flex; align-items: center; gap: 5px; padding: 8px 12px; border: 1px solid var(--color-border); border-radius: var(--radius-pill); background: var(--color-surface); color: var(--color-text-muted); font: inherit; font-size: 11px; cursor: pointer; }
.welcome__shortcut:hover { border-color: var(--color-primary); color: var(--color-text); }
.welcome__shortcut--expert { color: var(--color-primary); border-color: color-mix(in srgb, var(--color-primary) 30%, var(--color-border)); }

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

.ai-bubble--user {
  --elx-bubble-bg: var(--chat-user-bg);
  --elx-bubble-text-color: var(--color-text);
  --elx-bubble-radius: var(--radius-card);
  --elx-bubble-padding-x: 16px;
  --elx-bubble-padding-y: 10px;
}
.ai-bubble--user :deep(.elx-bubble__content) {
  border: 1px solid var(--chat-user-border);
}
.msg__bubble-text { font-size: 15px; line-height: 1.55; white-space: pre-wrap; }
.msg.msg--assistant-bubble { display: block; }
.ai-bubble--assistant { width: 100%; }
.ai-bubble--assistant :deep(.elx-bubble__content-wrapper) { width: 100%; }
.ai-bubble--assistant :deep(.elx-bubble__content) { width: 100%; min-height: 0; }
.ai-bubble--assistant .msg__stack { width: 100%; }

.msg--assistant {
  display: grid;
  grid-template-columns: 28px minmax(0, 1fr);
  gap: 14px;
  align-items: start;
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
  position: relative;
  padding: 0 20px 22px;
  background: linear-gradient(to top, var(--color-background) 55%, transparent);
}

.selected-expert { display: flex; align-items: center; gap: 7px; max-width: 720px; margin: 0 auto 9px; color: var(--color-primary); font-size: 12px; font-weight: 700; }
.selected-expert small { color: var(--color-text-muted); font-size: 10px; font-weight: 400; }
.selected-expert button { display: grid; place-items: center; width: 23px; height: 23px; border: 0; border-radius: 5px; background: transparent; color: var(--color-text-muted); cursor: pointer; }
.selected-expert button:hover { background: var(--chat-rail-bg); }
.icon-btn--plus { border-radius: 50%; background: var(--chat-rail-bg); color: var(--color-text); }
.composer-menu-backdrop { position: fixed; inset: 0; z-index: 9; border: 0; background: transparent; cursor: default; }
.composer-menu { position: absolute; z-index: 10; left: max(20px, calc(50% - 360px)); bottom: 80px; width: min(245px, calc(100vw - 34px)); padding: 7px; border: 1px solid var(--color-border); border-radius: 13px; background: var(--color-surface); box-shadow: var(--shadow-lg); }
.composer-menu--wide { width: min(305px, calc(100vw - 34px)); }
.composer-menu--mode { left: auto; right: max(20px, calc(50% - 360px)); width: min(270px, calc(100vw - 34px)); }
.composer-menu__label { display: block; padding: 7px 9px 6px; color: var(--color-text-muted); font-size: 10px; font-weight: 700; letter-spacing: .08em; }
.composer-menu button { display: flex; width: 100%; align-items: center; gap: 9px; padding: 9px 10px; border: 0; border-radius: 7px; background: transparent; color: var(--color-text); text-align: left; font: inherit; font-size: 12px; cursor: pointer; }
.composer-menu button:hover { background: var(--chat-rail-bg); }
.composer-menu button small { margin-left: auto; color: var(--color-text-muted); font-size: 10px; white-space: nowrap; }
.composer-menu .composer-menu__mode-option { align-items: flex-start; }
.composer-menu__mode-option > svg { flex: none; margin-top: 2px; }
.composer-menu__mode-option span { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.composer-menu__mode-option strong { font-size: 12px; font-weight: 600; }
.composer-menu .composer-menu__mode-option small { margin: 0; white-space: normal; line-height: 1.4; }
.composer-menu__chevron { margin-left: auto; }
.composer-menu__back { font-weight: 700 !important; border-bottom: 1px solid var(--color-border) !important; border-radius: 0 !important; margin-bottom: 5px; }
.composer-menu .is-hidden { visibility: hidden; }
.composer-menu__search { display: flex; align-items: center; gap: 6px; margin: 7px 4px; padding: 8px; border: 1px solid var(--color-border); border-radius: 7px; color: var(--color-text-muted); }
.composer-menu__search input { width: 100%; border: 0; outline: none; background: transparent; color: var(--color-text); font: inherit; font-size: 11px; }
.composer-menu__results { max-height: 265px; overflow-y: auto; }
.composer-menu__results p { padding: 12px; color: var(--color-text-muted); font-size: 11px; }
.composer-menu .composer-menu__all { margin-top: 5px; border-top: 1px solid var(--color-border); border-radius: 0; color: var(--color-primary); }

.ai-composer__box {
  max-width: 720px;
  margin: 0 auto;
  border: 0;
  border-radius: var(--radius-lg);
  background: transparent;
  box-shadow: none;
}

.ai-composer__sender { --el-border-radius-base: var(--radius-md); }
.ai-composer__sender :deep(.elx-x-sender__content) { padding: 6px 10px 8px; }
.ai-composer__sender :deep(.elx-x-sender__chat-room) { min-height: 72px; }
.ai-composer__sender :deep(.chat-rich-text) { max-height: 140px; min-height: 72px; padding: 10px 8px; font-size: 15px; line-height: 1.55; }
.ai-composer__sender :deep(.chat-placeholder-wrap) { padding: 10px 8px; font-weight: 400; }
.ai-composer__sender :deep(.elx-x-sender__updown-action-list) { min-height: 42px; align-items: center; }
.ai-composer__sender :deep(.elx-x-sender__prefix) { padding-left: 0; }
.ai-composer__sender :deep(.elx-x-sender__action-list) { height: auto; }
.ai-attachments { max-width: 720px; margin: 0 auto 7px; }
.ai-thinking { margin: 0; --elx-thinking-trigger-bg: var(--color-surface); --elx-thinking-trigger-bg-hover: var(--chat-rail-bg); --elx-thinking-trigger-border-color: var(--color-border); }
.ai-thinking :deep(.elx-thinking__trigger) { width: auto; padding: 7px 10px; }
.ai-thinking :deep(.elx-thinking__content) { color: var(--color-text-muted); }

.ai-composer__box:focus-within {
  border-color: transparent;
  box-shadow: none;
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

.composer-mode { display: inline-flex; align-items: center; gap: 5px; padding: 6px 8px; border: 0; border-radius: 7px; background: transparent; color: var(--color-text-muted); font: inherit; font-size: 11px; cursor: pointer; white-space: nowrap; }
.composer-mode:hover:not(:disabled) { background: var(--chat-rail-bg); color: var(--color-text); }
.composer-mode:disabled { opacity: .55; cursor: not-allowed; }

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

@media (max-width: 760px) {
  .ai-rail {
    position: absolute;
    z-index: 3;
    inset: 0 auto 0 0;
    width: min(82vw, 300px);
    box-shadow: var(--shadow-lg);
  }
  .ai-rail-backdrop {
    position: absolute;
    z-index: 2;
    inset: 0 0 0 min(82vw, 300px);
    display: block;
    border: 0;
    background: rgba(0, 0, 0, .26);
    cursor: pointer;
  }
  .ai-topbar { padding: 10px 12px; }
  .ai-topbar__home { display: grid; }
  .ai-topbar__reset--new { display: inline-flex; }
}

@media (max-width: 640px) {
  .ai-topbar,
  .ai-messages,
  .ai-composer { padding-left: 12px; padding-right: 12px; }
  .welcome__title { font-size: 22px; }
  .welcome__component :deep(.elx-welcome__title) { font-size: 22px; }
  .msg__user-col { max-width: 88%; }
  .msg--assistant {
    grid-template-columns: 24px minmax(0, 1fr);
    gap: 10px;
  }
  .ai-main--empty .ai-messages { padding-top: 18px; }
  .ai-main--empty .ai-composer__input { min-height: 85px; }
  .welcome__shortcuts { margin-top: 18px; }
  .composer-menu { left: 12px; bottom: 78px; }
  .composer-menu--mode { left: auto; right: 12px; }
}

@media (prefers-reduced-motion: reduce) {
  .msg { animation: none; transition: none; }
}
</style>
