import { getApiMode } from './config'
import { mockGet } from './adapters/mockAdapter'
import { httpGet } from './adapters/httpAdapter'
import type { AbilityGraphData } from '@/composables/useAbilityGraph'
import type { RoleIntro } from '@/composables/useAbilityGraph'

function roleKey(role: string): string {
  if (/前端|Vue|React/.test(role)) return 'frontend'
  if (/后端|Java|Go/.test(role)) return 'backend'
  if (/测试|QA/.test(role)) return 'qa'
  if (/数据|分析/.test(role)) return 'data'
  if (/机器|算法|AI|智能/.test(role)) return 'ml'
  return 'frontend'
}

/** `/api/ability-graph` — http 直连后端；mock 读 fixtures。 */
export async function fetchAbilityGraph(role: string): Promise<AbilityGraphData | null> {
  const key = roleKey(role)
  if (getApiMode() === 'mock') {
    try {
      const env = await mockGet<AbilityGraphData & { role?: string }>(`ability/graph.${key}.json`)
      if (env.data?.nodes?.length) {
        return { nodes: env.data.nodes, edges: env.data.edges ?? [] }
      }
    } catch {
      if (key !== 'frontend') {
        try {
          const env = await mockGet<AbilityGraphData>('ability/graph.frontend.json')
          if (env.data?.nodes?.length) return { nodes: env.data.nodes, edges: env.data.edges ?? [] }
        } catch { /* fall through */ }
      }
    }
    return null
  }

  try {
    const env = await httpGet<AbilityGraphData>('/api/ability-graph', { role })
    if (env.data?.nodes) return { nodes: env.data.nodes, edges: env.data.edges ?? [] }
  } catch {
    /* backend-gap */
  }
  return null
}

export async function fetchRoleIntro(role: string): Promise<RoleIntro | null> {
  const key = roleKey(role)
  if (getApiMode() === 'mock') {
    // roleKey's default is "frontend" for graph fixtures. An unrelated role
    // must not inherit the frontend introduction when no role fixture exists.
    if (key === 'frontend' && !/前端|Vue|React/.test(role)) return null
    try {
      const env = await mockGet<RoleIntro>(`ability/role-intro.${key}.json`)
      return env.data ?? null
    } catch {
      return null
    }
  }

  try {
    const env = await httpGet<RoleIntro>('/api/career/role-intro', { role })
    return env.data ?? null
  } catch {
    return null
  }
}
