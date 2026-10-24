import type { AgentRunControlSnapshot, AgentRunEvent } from '@/api/agentTask'
import { statusLabel } from './agentRunControlModel'

export type AgentRunTimelineTone = 'neutral' | 'success' | 'warning' | 'error'

export type AgentRunTimelineItem = {
  id: string
  eventType: string
  occurredAt: string
  title: string
  detail?: string
  tone: AgentRunTimelineTone
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

/** Project only allow-listed, user-safe event facts. Unknown payload fields stay hidden. */
export function toAgentRunTimelineItem(event: AgentRunEvent, runId = ''): AgentRunTimelineItem | null {
  const payload = asRecord(event.payload)
  const base = {
    id: String(event.event_seq),
    eventType: event.event_type,
    occurredAt: event.occurred_at,
    tone: 'neutral' as AgentRunTimelineTone,
  }
  const step = stepNumber(payload)
  switch (event.event_type) {
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
