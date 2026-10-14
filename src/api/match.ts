import { getApiMode } from './config'
import { mockGet } from './adapters/mockAdapter'
import { httpGet, httpPost } from './adapters/httpAdapter'

export type MatchResult = {
  student_id: string
  job_portrait_id: string
  position_name?: string
  total_score?: number
  skill_coverage?: number
  is_matched?: boolean
  match_level?: string
  dimensions?: Record<string, unknown>
}

export type MatchExplain = {
  student_id: string
  job_portrait_id: string
  position_name?: string | null
  total_score?: number | null
  skill_coverage?: number | null
  scores_authoritative?: boolean
  keyword_coverage?: {
    matched?: string[]
    missing?: string[]
    highlight_missing?: string[]
    matched_count?: number
    missing_count?: number
  }
  evidence?: Array<{ skill: string; status: string; span?: string; source?: string }>
  gaps?: unknown[]
  graph_paths?: unknown[]
  related_courses?: Array<{ title?: string; skill?: string; course_id?: string }>
  match_level?: string
  is_matched?: boolean
}

export type HybridCandidate = {
  id: string
  job_portrait_id?: string | null
  role_name?: string
  position_name?: string
  retrieve_score?: number
  channels?: string[]
  matched_keywords?: string[]
  components?: { vector?: number; keyword?: number; graph?: number; rrf?: number }
}

export async function getMatchResult(
  studentId: string,
  jobPortraitId: string,
): Promise<MatchResult | null> {
  if (getApiMode() === 'mock') {
    const env = await mockGet<MatchResult>('match/result.json')
    return env.data ?? null
  }
  const env = await httpGet<MatchResult>(`/api/match/result/${studentId}/${jobPortraitId}`)
  return env.data ?? null
}

export async function getMatchExplain(
  studentId: string | undefined,
  jobPortraitId: string,
): Promise<MatchExplain | null> {
  if (getApiMode() === 'mock') {
    const env = await mockGet<MatchExplain>('match/explain.json')
    return env.data ?? null
  }
  if (!studentId) throw new Error('HTTP 匹配解释必须提供当前已登录账号 ID')
  const env = await httpGet<MatchExplain>(`/api/match/explain/${studentId}/${jobPortraitId}`)
  return env.data ?? null
}

export async function getSkillGap(studentId: string, jobPortraitId: string) {
  if (getApiMode() === 'mock') {
    return mockGet('match/skill-gap.json')
  }
  return httpGet(`/api/match/skill-gap/${studentId}/${jobPortraitId}`)
}

export async function hybridCandidates(body: {
  skills: Array<string | { name: string }>
  preferred_role?: string
  top_k?: number
  enable_graph_hop?: boolean
}): Promise<{ candidates: HybridCandidate[]; graph?: unknown; note?: string }> {
  if (getApiMode() === 'mock') {
    const env = await mockGet<{ candidates: HybridCandidate[]; note?: string }>(
      'match/hybrid-candidates.json',
    )
    return env.data ?? { candidates: [] }
  }
  const env = await httpPost<{ candidates: HybridCandidate[]; graph?: unknown; note?: string }>(
    '/api/match/hybrid-candidates',
    body,
  )
  return env.data ?? { candidates: [] }
}
