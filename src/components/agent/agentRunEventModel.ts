import type { AgentRunControlSnapshot, AgentRunEvent } from '@/api/agentTask'
import { statusLabel } from './agentRunControlModel'

export type AgentRunTimelineTone = 'neutral' | 'success' | 'warning' | 'error'

export type AgentRunTimelineItem = {
  id: string
  eventSeq: number
  eventType: string
  occurredAt: string
  title: string
  detail?: string
  tone: AgentRunTimelineTone
  kind?: 'tool_call'
}

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'partial'])
const ACTIVE = new Set([
  'queued', 'planning', 'planned', 'running', 'steps_completed', 'finalizing',
  'pause_requested', 'cancel_requested',
])

export function isAgentRunTerminal(status: string): boolean {
  return TERMINAL.has(status)
}

export function isAgentRunActive(status: string): boolean {
  return ACTIVE.has(status)
}

export function needsAgentRunAttention(status: string): boolean {
  return ['waiting_input', 'waiting_authorization', 'needs_reconciliation'].includes(status)
}

export function completedStepCount(run: AgentRunControlSnapshot | null | undefined): number {
  return run?.current_plan?.steps.filter(step => step.status === 'completed').length || 0
}

export function summarizeAgentRun(
  run: AgentRunControlSnapshot | null | undefined,
  fallbackStatus = '',
): string {
  if (!run) return fallbackStatus ? `${statusLabel(fallbackStatus)} · 查看执行记录` : '查看任务执行记录'

  const steps = run.current_plan?.steps || []
  const done = completedStepCount(run)
  const current = steps.find(step => step.status === 'running')
  const stepLabel = current
    ? `正在执行第 ${current.step_index + 1} 步`
    : steps.length ? `已完成 ${done}/${steps.length} 步` : ''
  const saved = run.saved_artifacts?.length || 0
  const savedLabel = saved ? `${saved} 个已保存版本` : ''
  return [statusLabel(run.status), stepLabel, savedLabel].filter(Boolean).join(' · ')
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function safeLabel(value: unknown, maxLength = 100): string {
  if (typeof value !== 'string') return ''
  return value.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim().slice(0, maxLength)
}

function stepNumber(payload: Record<string, unknown>): string {
  const index = payload.step_index
  return Number.isInteger(index) && Number(index) >= 0 ? `第 ${Number(index) + 1} 步 · ` : ''
}

function agentLabel(value: unknown): string {
  const agent = safeLabel(value, 60)
  const known: Record<string, string> = {
    resume_preparation: '简历准备',
    career_exploration: '职业探索',
    practice_review: '练习复盘',
    clarify: '需求澄清',
  }
  return known[agent] || '业务专家'
}

const TOOL_CALL_ID = /^[A-Za-z0-9_.:-]{1,128}$/u
const TOOL_LABELS: Record<string, string> = {
  career_data_read: '读取当前任务允许的职业资料',
}
const TOOL_ERROR_DETAILS: Record<string, string> = {
  permission_denied: '这次调用未获得所需权限。',
  tool_timeout: '工具等待超时，未得到可确认结果。',
  tool_connection_error: '工具连接失败，未得到可确认结果。',
  tool_execution_error: '工具执行未完成。',
  tool_output_truncated: '结果过长，系统未能完整接收。',
  tool_result_missing: '执行记录未包含工具返回结果。',
  invalid_tool_call_id: '工具返回与本次调用不匹配，未采用该结果。',
  tool_call_id_conflict: '工具返回与本次调用不匹配，未采用该结果。',
}

type ToolCallEvent = {
  event: AgentRunEvent
  payload: Record<string, unknown>
  phase: 'started' | 'settled'
}

type ToolCallGroup = {
  identity: string
  started?: ToolCallEvent
  settled?: ToolCallEvent
}

function validToolCallEvent(event: AgentRunEvent): ToolCallEvent | null {
  const phase = event.event_type === 'run.tool_call_started'
    ? 'started'
    : event.event_type === 'run.tool_call_settled' ? 'settled' : null
  if (!phase) return null
  const payload = asRecord(event.payload)
  const schemaVersion = payload.schema_version
  const modelIteration = payload.model_iteration
  if ((schemaVersion !== 1 && schemaVersion !== 2)
    || (schemaVersion === 2 && (!Number.isInteger(modelIteration) || Number(modelIteration) < 1 || Number(modelIteration) > 6))
    || (modelIteration !== undefined && (!Number.isInteger(modelIteration) || Number(modelIteration) < 1 || Number(modelIteration) > 6))
    || typeof payload.turn_id !== 'string' || !/^turn_[a-f0-9]{32}$/u.test(payload.turn_id)
    || typeof payload.assistant_message_id !== 'string' || !/^msg_[a-f0-9]{32}$/u.test(payload.assistant_message_id)
    || typeof payload.tool_call_id !== 'string' || !TOOL_CALL_ID.test(payload.tool_call_id)
    || typeof payload.tool_name !== 'string' || !/^[a-z][a-z0-9_]{0,63}$/u.test(payload.tool_name)
    || !Number.isInteger(payload.plan_version) || Number(payload.plan_version) < 1
    || !Number.isInteger(payload.contract_revision) || Number(payload.contract_revision) < 0
    || !Number.isInteger(payload.step_index) || Number(payload.step_index) < 1
    || !Number.isInteger(payload.attempt) || Number(payload.attempt) < 1) return null

  if (phase === 'started') {
    const summary = asRecord(payload.input_summary)
    if (payload.status !== 'started'
      || !Number.isInteger(summary.argument_count)
      || Number(summary.argument_count) < 0 || Number(summary.argument_count) > 256
      || !Array.isArray(summary.argument_names)
      || summary.argument_names.length > 32
      || summary.argument_names.some(name => typeof name !== 'string' || !/^[A-Za-z][A-Za-z0-9_]{0,63}$/u.test(name))) return null
  } else {
    const status = safeLabel(payload.status, 32)
    const summary = asRecord(payload.output_summary)
    if (!/^[a-z_]{1,32}$/u.test(status)
      || !['json_object', 'json_array', 'text', 'empty'].includes(String(summary.result_kind))
      || !Number.isInteger(summary.output_bytes) || Number(summary.output_bytes) < 0 || Number(summary.output_bytes) > 10 * 1024 * 1024
      || !Number.isInteger(summary.field_count) || Number(summary.field_count) < 0 || Number(summary.field_count) > 256
      || !Number.isInteger(summary.attempts) || Number(summary.attempts) < 0 || Number(summary.attempts) > 4
      || (summary.error_code !== null && typeof summary.error_code !== 'string')) return null
  }
  return { event, payload, phase }
}

function toolCallIdentity(payload: Record<string, unknown>, runId: string): string {
  return JSON.stringify([
    runId,
    payload.turn_id,
    payload.assistant_message_id,
    payload.tool_call_id,
    payload.model_iteration ?? null,
    payload.plan_version,
    payload.contract_revision,
    payload.step_index,
    payload.attempt,
    payload.tool_name,
  ])
}

function toolResultKind(value: unknown): string {
  return ({
    json_object: '对象结果',
    json_array: '列表结果',
    text: '文本结果',
    empty: '空结果',
  } as Record<string, string>)[String(value)] || '结果结构待核验'
}

function toolStatusLabel(status: unknown): { label: string; tone: AgentRunTimelineTone; detail: string } {
  switch (status) {
    case 'succeeded': return { label: '已完成', tone: 'success', detail: '工具调用已完成。' }
    case 'failed': return { label: '未完成', tone: 'error', detail: '工具调用未完成。' }
    case 'denied': return { label: '权限不足', tone: 'warning', detail: '工具调用因权限限制未完成。' }
    case 'partial': return { label: '部分结果', tone: 'warning', detail: '工具返回了部分结果。' }
    case 'unavailable': return { label: '暂不可用', tone: 'warning', detail: '工具当前不可用。' }
    case 'needs_input':
    case 'approval_required': return { label: '需要补充', tone: 'warning', detail: '工具需要补充信息后才能继续。' }
    case 'started':
    case 'running':
    case 'pending':
    case 'queued': return { label: '处理中', tone: 'neutral', detail: '工具调用仍在处理中，尚未确认完成。' }
    default: return { label: '状态待核验', tone: 'warning', detail: '工具调用状态待核验，尚未确认结果。' }
  }
}

function unresolvedToolDetail(runStatus: string): string {
  if (isAgentRunActive(runStatus) || needsAgentRunAttention(runStatus)) {
    return '已发起调用；当前执行记录尚未包含工具结果。'
  }
  if (runStatus === 'paused') return '任务已暂停；当前执行记录尚未包含工具结果。'
  if (isAgentRunTerminal(runStatus)) return '任务已结束；当前执行记录没有这次调用的结果。'
  return '已发起调用；结果暂未在执行记录中核实。'
}

function toolCallItem(group: ToolCallGroup, runStatus: string): AgentRunTimelineItem {
  const start = group.started
  const settled = group.settled
  const event = settled?.event || start!.event
  const payload = settled?.payload || start!.payload
  const startSummary = asRecord(start?.payload.input_summary)
  const inputCount = Number.isInteger(startSummary.argument_count) ? Number(startSummary.argument_count) : null
  const inputDetail = inputCount === null ? '' : `输入摘要：${inputCount} 项`
  let tone: AgentRunTimelineTone = 'warning'
  let outputDetail = ''
  let errorDetail = ''

  if (!settled) {
    tone = isAgentRunActive(runStatus) || needsAgentRunAttention(runStatus) ? 'neutral' : 'warning'
    outputDetail = unresolvedToolDetail(runStatus)
  } else {
    const status = toolStatusLabel(settled.payload.status)
    tone = status.tone
    outputDetail = status.detail
    const summary = asRecord(settled.payload.output_summary)
    const kind = toolResultKind(summary.result_kind)
    const fieldCount = Number.isInteger(summary.field_count) ? Number(summary.field_count) : 0
    const shape = fieldCount > 0 ? `${kind}，${fieldCount} 个字段` : kind
    outputDetail += ` 结果结构：${shape}。`
    const errorCode = safeLabel(summary.error_code, 64)
    errorDetail = ['failed', 'denied', 'unavailable'].includes(String(settled.payload.status))
      ? TOOL_ERROR_DETAILS[errorCode] || ''
      : ''
  }

  const toolName = String(payload.tool_name)
  return {
    id: `tool-call:${start?.event.event_seq ?? event.event_seq}`,
    eventSeq: start?.event.event_seq ?? event.event_seq,
    eventType: settled ? 'run.tool_call_settled' : 'run.tool_call_started',
    occurredAt: event.occurred_at,
    title: TOOL_LABELS[toolName] || 'Agent 工具调用',
    detail: [outputDetail, inputDetail, errorDetail].filter(Boolean).join(' '),
    tone,
    kind: 'tool_call',
  }
}

/** Build a per-run timeline; pair tool events only when their complete stable identity matches. */
export function toAgentRunTimelineItems(
  events: AgentRunEvent[],
  runId = '',
  runStatus = '',
): AgentRunTimelineItem[] {
  const groups = new Map<string, ToolCallGroup>()
  const projected: AgentRunTimelineItem[] = []
  for (const event of mergeAgentRunEvents([], events)) {
    if (event.event_type === 'run.tool_call_started' || event.event_type === 'run.tool_call_settled') {
      const call = validToolCallEvent(event)
      if (!call) continue
      const identity = toolCallIdentity(call.payload, runId)
      const group = groups.get(identity) || { identity }
      if (call.phase === 'started' && !group.started) group.started = call
      if (call.phase === 'settled' && !group.settled) group.settled = call
      groups.set(identity, group)
      continue
    }
    const item = toAgentRunTimelineItem(event, runId)
    if (item) projected.push(item)
  }
  for (const group of groups.values()) projected.push(toolCallItem(group, runStatus))
  return projected.sort((a, b) => a.eventSeq - b.eventSeq)
}

/** Project only allow-listed, user-safe event facts. Unknown payload fields stay hidden. */
export function toAgentRunTimelineItem(event: AgentRunEvent, runId = ''): AgentRunTimelineItem | null {
  const payload = asRecord(event.payload)
  const base = {
    id: String(event.event_seq),
    eventSeq: event.event_seq,
    eventType: event.event_type,
    occurredAt: event.occurred_at,
    tone: 'neutral' as AgentRunTimelineTone,
  }
  const step = stepNumber(payload)
  switch (event.event_type) {
    case 'run.tool_call_started':
    case 'run.tool_call_settled': return null
    case 'run.submitted': return { ...base, title: '任务已提交' }
    case 'run.planning': return { ...base, title: '正在准备计划' }
    case 'run.plan_created': return { ...base, title: '计划已生成' }
    case 'run.plan_revised':
    case 'run.contract_revised': return { ...base, title: '任务计划已修订' }
    case 'run.contract_created': return { ...base, title: '任务目标已记录' }
    case 'run.step_started': return { ...base, title: `${step}开始执行` }
    case 'run.step_completed': return { ...base, title: `${step}已完成`, tone: 'success' }
    case 'run.step_failed': return { ...base, title: `${step}执行遇到问题`, tone: 'error' }
    case 'run.step_needs_reconciliation':
      return { ...base, title: `${step}需要核对执行结果`, tone: 'warning' }
    case 'run.step_superseded': return { ...base, title: `${step}已由新计划替代` }
    case 'run.resource_read_started':
    case 'run.resource_read_completed': {
      const label = safeLabel(payload.label)
      const started = event.event_type.endsWith('_started')
      return {
        ...base,
        title: started ? '正在读取允许的资料' : '已读取允许的资料',
        ...(label ? { detail: label } : {}),
      }
    }
    case 'run.business_delegated': return { ...base, title: `已委派给${agentLabel(payload.agent)}` }
    case 'run.waiting_input':
      return { ...base, title: '等待你补充信息', ...(safeLabel(payload.reason, 180) ? { detail: safeLabel(payload.reason, 180) } : {}), tone: 'warning' }
    case 'run.waiting_authorization':
      return { ...base, title: '等待权限处理', ...(safeLabel(payload.reason, 180) ? { detail: safeLabel(payload.reason, 180) } : {}), tone: 'warning' }
    case 'run.pause_requested': return { ...base, title: '已收到暂停请求' }
    case 'run.paused': return { ...base, title: '任务已暂停', tone: 'warning' }
    case 'run.resumed': return { ...base, title: '任务已恢复' }
    case 'run.cancel_requested': return { ...base, title: '正在等待安全点以取消', tone: 'warning' }
    case 'run.cancelled': return { ...base, title: '任务已取消', tone: 'warning' }
    case 'run.steps_completed': return { ...base, title: '计划步骤已完成' }
    case 'run.finalizing': return { ...base, title: '正在整理结果' }
    case 'run.completed': return { ...base, title: '任务已完成', tone: 'success' }
    case 'run.partial': return { ...base, title: '任务部分完成', tone: 'warning' }
    case 'run.failed': return { ...base, title: '任务执行失败', detail: failureDetail(payload, runId), tone: 'error' }
    case 'run.dispatch_needs_reconciliation': return { ...base, title: '需要核对执行结果', tone: 'warning' }
    case 'run.executor_unavailable': return { ...base, title: '执行暂时不可用', tone: 'warning' }
    case 'run.dispatch_retry_scheduled': return { ...base, title: '任务将在可用时继续执行' }
    case 'run.artifact_save_confirmed': return { ...base, title: '已确认保存计划版本' }
    case 'run.artifact_saved': return { ...base, title: '计划版本已保存', tone: 'success' }
    case 'run.followup_received': return { ...base, title: '已收到任务补充' }
    case 'run.followup_classification_waiting': return { ...base, title: '补充正在等待安全处理节点' }
    case 'run.followup_classification_started': return { ...base, title: '正在核对任务补充' }
    case 'run.followup_classified': return { ...base, title: '任务补充已核对' }
    case 'run.followup_needs_reconciliation': return { ...base, title: '任务补充需要核对', tone: 'warning' }
    case 'run.followup_budget_blocked': return { ...base, title: '任务补充暂未应用', tone: 'warning' }
    case 'run.followup_applied': return { ...base, title: '任务已按补充更新', tone: 'success' }
    default: return null
  }
}

function failureDetail(payload: Record<string, unknown>, runId: string): string {
  const code = safeLabel(payload.error_code, 64)
  const known: Record<string, string> = {
    resource_read_result_unverified:
      '这一步需要参考资料，但没有取得可核验的读取结果；任务已停止，未把未读内容作为依据。请确认资料已就绪，或改成不依赖资料的问题。',
  }
  const reason = known[code] || '系统没有提供可安全展示的失败说明。'
  const reference = safeLabel(runId, 80)
  return reference ? `${reason} 运行编号：${reference}` : reason
}

/** Merge durable per-run events by sequence, discarding duplicate pages. */
export function mergeAgentRunEvents(
  existing: AgentRunEvent[],
  incoming: AgentRunEvent[],
): AgentRunEvent[] {
  const bySeq = new Map<number, AgentRunEvent>()
  for (const event of [...existing, ...incoming]) {
    if (Number.isInteger(event.event_seq) && event.event_seq > 0 && !bySeq.has(event.event_seq)) {
      bySeq.set(event.event_seq, event)
    }
  }
  return [...bySeq.values()].sort((a, b) => a.event_seq - b.event_seq)
}

export function appendContiguousAgentRunEvents(
  existing: AgentRunEvent[],
  cursor: number,
  incoming: AgentRunEvent[],
): { events: AgentRunEvent[]; cursor: number; gap: boolean } {
  const events = mergeAgentRunEvents(existing, incoming)
  let next = cursor
  for (const event of incoming.slice().sort((a, b) => a.event_seq - b.event_seq)) {
    if (!Number.isInteger(event.event_seq) || event.event_seq <= next) continue
    if (event.event_seq !== next + 1) return { events, cursor: next, gap: true }
    next = event.event_seq
  }
  return { events, cursor: next, gap: false }
}
