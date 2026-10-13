import type { Router } from 'vue-router'
import { getApiMode } from '@/api/config'
import {
  buildAgentResourceQuery,
  isCareerResourceUri,
  isPipelineTaskId,
  type AgentResourceReference,
} from './agentResourceHandoffContract'

export { isCareerResourceUri, isPipelineTaskId }
export type { AgentResourceReference }

/** Route an opaque reference, never a browser-side summary or computed score. */
export function openAgentWithResource(
  router: Router,
  reference: AgentResourceReference,
  sessionId?: string,
): boolean {
  const query = buildAgentResourceQuery(getApiMode(), reference, sessionId)
  if (!query) return false
  void router.push({ name: 'student-ai-assistant', query })
  return true
}
