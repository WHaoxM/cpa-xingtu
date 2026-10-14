import type { ResumeTraceEvent } from '@/api/pipeline'

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
