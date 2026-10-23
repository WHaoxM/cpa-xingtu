import type { Router } from 'vue-router'
import { getApiMode } from '@/api/config'
import {taskCompanionEnabled} from './taskCompanionFeature'
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
  interactionMode?: 'ask' | 'agent' | 'experts',
): boolean {
  const query = buildAgentResourceQuery(getApiMode(), reference, sessionId, interactionMode)
  if (!query) return false
  const supportedTask = reference.kind==='pipeline_task' || (reference.kind==='career_resource' &&
    (reference.uri==='career://me/resume' || /^career:\/\/me\/(explorations|action-plans)\//.test(reference.uri)))
  if (taskCompanionEnabled && supportedTask && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('cpa:agent-handoff', {detail:{reference,sessionId}}))
    return true
  }
  void router.push({ name: 'student-ai-assistant', query })
  return true
}
