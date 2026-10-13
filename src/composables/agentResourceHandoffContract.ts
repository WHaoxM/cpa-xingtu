export type AgentResourceReference =
  | { kind: 'pipeline_task'; taskId: string }
  | { kind: 'career_resource'; uri: string }

export function isPipelineTaskId(value: unknown): value is string {
  return typeof value === 'string' && /^task_[A-Za-z0-9]+$/.test(value)
}

/** Only the server decides whether the current Principal may read this resource. */
export function isCareerResourceUri(value: unknown): value is string {
  return typeof value === 'string'
    && value.length <= 160
    && /^career:\/\/me\/[A-Za-z0-9][A-Za-z0-9/_-]*$/.test(value)
}

export function buildAgentResourceQuery(
  mode: 'mock' | 'http',
  reference: AgentResourceReference,
  sessionId?: string,
): Record<string, string> | null {
  if (mode !== 'http') return null
  const query: Record<string, string> = {}
  if (reference.kind === 'pipeline_task') {
    if (!isPipelineTaskId(reference.taskId)) return null
    query.task_id = reference.taskId
  } else {
    if (!isCareerResourceUri(reference.uri)) return null
    query.resource_uri = reference.uri
  }
  if (sessionId) query.session_id = sessionId
  return query
}

/** Apply only to a fresh owner-scoped HTTP list, never persisted store records. */
export function hasServerReportCollection(
  mode: 'mock' | 'http',
  rows: Array<{ id: string; snapshot: Record<string, unknown> }>,
): boolean {
  return mode === 'http' && rows.some(row =>
    /^[A-Za-z0-9_-]{1,128}$/.test(row.id)
    && ['partial', 'completed'].includes(String(row.snapshot?.status ?? '')),
  )
}

/** Saved jobs are user-submitted context, not verified recommendations. */
export function hasServerSavedJobCollection(
  mode: 'mock' | 'http',
  rows: Array<{ id: string }>,
): boolean {
  return mode === 'http' && rows.some(row =>
    typeof row.id === 'string' && row.id.trim().length > 0,
  )
}
