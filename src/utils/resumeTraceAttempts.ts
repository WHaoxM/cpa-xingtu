import type { ResumeTraceEvent } from '@/api/pipeline'

/** Finishing an entity checkpoint is not proof that the skill names were verified. */
export function describeResumeEntityCheckpoint(linkStatus: unknown) {
  if (linkStatus === 'not_required') return { limited: false, detail: '没有需要关联的技能线索' }
  if (linkStatus === 'completed' || linkStatus === 'proposed') {
    return { limited: false, detail: '已整理关联候选，仍需结合原文核对' }
  }
  if (linkStatus === 'partial') return { limited: true, detail: '部分技能关联待核对' }
  if (linkStatus === 'unresolved') return { limited: true, detail: '技能关联暂不可用，名称尚未核验' }
  return { limited: true, detail: '技能关联状态尚未确认' }
}

/** Keep old attempts auditable without presenting them as the current Agent run. */
export function splitResumeTraceAttempts(events: ResumeTraceEvent[], currentAttempt: number | null) {
  const current: ResumeTraceEvent[] = []
  const history: ResumeTraceEvent[] = []
  for (const event of events) {
    if (currentAttempt !== null && event.attempt === currentAttempt) {
      current.push(event)
    } else if (currentAttempt === 0 && event.attempt === null && event.stage === 'file_received') {
      // The durable upload receipt precedes the first worker claim; it is not an Agent checkpoint.
      current.push(event)
    } else {
      history.push(event)
    }
  }
  return { current, history }
}
