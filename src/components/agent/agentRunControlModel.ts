import type {
  AgentRunControlRequest, AgentRunControlSnapshot, AgentRunTaskPatch,
} from '../../api/agentTask'
export type {
  AgentRunControlRequest, AgentRunControlSnapshot, AgentRunTaskPatch,
} from '../../api/agentTask'

export const statusLabel = (status: string): string => ({
  queued: '等待执行', planning: '正在规划', planned: '等待步骤执行',
  running: '正在执行', steps_completed: '步骤已完成', finalizing: '正在整理成果',
  pause_requested: '将在安全点暂停', paused: '已暂停', waiting_input: '等待你补充',
  waiting_authorization: '等待授权', cancel_requested: '正在取消',
  needs_reconciliation: '需要核对执行结果', completed: '已完成',
  partial: '部分完成', failed: '执行失败', cancelled: '已取消',
} as Record<string, string>)[status] || '状态待核对'

const TERMINAL = new Set(['completed', 'failed', 'cancelled'])

export function canReviseTask(run: AgentRunControlSnapshot): boolean {
  return !!run.task_contract
    && !TERMINAL.has(run.status)
    && !['cancel_requested', 'needs_reconciliation', 'finalizing'].includes(run.status)
}

export function canPauseTask(run: AgentRunControlSnapshot): boolean {
  return !run.pause_requested
    && ['queued', 'planning', 'planned', 'running', 'steps_completed', 'finalizing'].includes(run.status)
}

export function canCancelTask(run: AgentRunControlSnapshot): boolean {
  return !TERMINAL.has(run.status) && !run.cancel_requested
}

export function canResumeTask(run: AgentRunControlSnapshot): boolean {
  return run.status === 'paused' && !run.cancel_requested
}

export function hasSavedPlan(run: AgentRunControlSnapshot, planVersion: number): boolean {
  return (run.saved_artifacts || []).some(item =>
    item.contract_revision === run.current_contract_revision
      && item.plan_version === planVersion,
  )
}

export function currentPlanCanBeSaved(run: AgentRunControlSnapshot): boolean {
  const plan = run.current_plan
  return run.status === 'completed'
    && !!plan
    && plan.plan_version > 0
    && plan.plan_version === run.current_plan_version
    && plan.metadata?.task_contract_revision === run.current_contract_revision
    && !!plan.plan_sha256
    && !hasSavedPlan(run, plan.plan_version)
}

export function controlRequest(
  run: AgentRunControlSnapshot,
  intent: AgentRunControlRequest['intent'],
  patch?: AgentRunTaskPatch,
): AgentRunControlRequest {
  return {
    intent,
    task_id: run.run_id,
    expected_revision: run.current_contract_revision,
    ...(patch ? { patch } : {}),
  }
}
