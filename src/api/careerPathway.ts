import { getApiMode } from './config'
import { httpGet } from './adapters/httpAdapter'

export interface PathwayEvidence { url: string; note: string }
export interface PathwayJobFact {
  fact_id: string
  title: string
  employer: string
  locations: string[]
  source_uri: string
  source_fetched_at: string
  vacancy_validity: 'unknown' | 'open' | 'closed'
  recruitment_type: string
  summary: string
  requirements: Array<{ kind: 'all_of' | 'any_of' | 'preferred' | 'not_stated'; label: string; values: string[] }>
  salary_quote: Record<string, unknown> | null
  usage: 'reference_only'
  scoring_ready: false
}
export interface PathwaySalaryReference {
  reference_id: string
  kind: 'estimate'
  city: string
  experience_level: string
  currency: 'CNY'
  period: 'month'
  lower: number
  upper: number
  method: string
  basis: Array<{ title: string; url: string; note: string }>
  as_of: string
  uncertainty: string
  disclaimer: string
}
export interface PathwaySkill {
  skill_id: number
  name: string
  tier: 'foundation' | 'application' | 'engineering'
  requirement_kind: 'recommended'
  evidence: PathwayEvidence
}
export interface PathwayCourse {
  course_id: string
  name: string
  skill_ids: number[]
  chapter_ids: number[]
  source_url: string
}
export interface BackendDevelopmentPathway {
  schema_version: 'career-pathway/v1'
  role_id: 'backend-development'
  role_name: string
  revision: string
  content_sha256: string
  published_at: string
  jobs: PathwayJobFact[]
  salary_references: PathwaySalaryReference[]
  skills: PathwaySkill[]
  courses: PathwayCourse[]
  prerequisites: Array<{ from_skill_id: number; to_skill_id: number; evidence: PathwayEvidence }>
  projection_status: {
    graph: { status: 'ready' | 'pending' | 'failed'; [key: string]: unknown }
    vector: { status: 'ready' | 'pending' | 'failed'; [key: string]: unknown }
  }
}

export interface PathwayGraph {
  status: 'ready' | 'unavailable' | 'partial'
  source_id?: string
  role_id?: string
  revision?: string
  content_sha256?: string
  skills?: PathwaySkill[]
  courses?: PathwayCourse[]
  prerequisites?: BackendDevelopmentPathway['prerequisites']
  relation_semantics?: 'prerequisite_to_dependent'
  reason?: string
  next_action?: string
}
export interface PathwaySearchHit {
  id: string
  source_id: string
  role_id: string
  revision: string
  content_sha256: string
  kind: 'skill' | 'course' | 'prerequisite' | 'job_reference'
  entity_key: string
  chunk_id: string
  chunk_sha256: string
  text: string
  distance: number
  match_eligible: false
  score_kind: 'retrieval_similarity_only'
  visibility: 'public'
}
export interface PathwaySearch {
  status: 'ready' | 'empty' | 'partial'
  source_id?: string
  role_id?: string
  revision?: string
  content_sha256?: string
  results: PathwaySearchHit[]
  coverage?: string
  truncated?: boolean
  rejected_unverified_hits?: number
  reason?: string
  next_action?: string
}

export async function readBackendDevelopmentGraph(): Promise<PathwayGraph> {
  const response = await httpGet<PathwayGraph>('/api/career/role-pathways/backend-development/graph')
  if (!response.success || !response.data) throw new Error('暂时无法读取技能关系，请重试。')
  const data = response.data
  if (data.status === 'ready' && (!Array.isArray(data.skills) || !Array.isArray(data.courses)
    || !Array.isArray(data.prerequisites) || data.relation_semantics !== 'prerequisite_to_dependent')) {
    throw new Error('技能关系的结构暂时无法核对，请重试。')
  }
  return data
}

export async function searchBackendDevelopmentPathway(query: string): Promise<PathwaySearch> {
  const q = query.trim()
  if (!q || [...q].length > 160) throw new Error('请填写 1–160 个字符的资料关键词。')
  const response = await httpGet<PathwaySearch>('/api/career/role-pathways/backend-development/search', { q })
  if (!response.success || !response.data || !Array.isArray(response.data.results)) {
    throw new Error('相关资料暂时无法读取，请重试。')
  }
  return response.data
}

/** Public, read-only reference material. This endpoint never starts a match or learning record. */
export async function readBackendDevelopmentPathway(): Promise<BackendDevelopmentPathway> {
  if (getApiMode() !== 'http') throw new Error('后端开发路径仅从真实服务读取，没有演示资料回退。')
  const response = await httpGet<BackendDevelopmentPathway>('/api/career/role-pathways/backend-development')
  const data = response.data
  if (!response.success || !data || data.schema_version !== 'career-pathway/v1'
    || data.role_id !== 'backend-development' || !data.revision || !data.content_sha256
    || !Array.isArray(data.jobs) || !Array.isArray(data.skills)
    || !Array.isArray(data.courses) || !Array.isArray(data.salary_references)
    || !Array.isArray(data.prerequisites)) {
    throw new Error('路径资料尚未形成可读取的版本，请稍后重试。')
  }
  if (data.jobs.some(job => job.usage !== 'reference_only' || job.scoring_ready !== false
    || !Array.isArray(job.requirements) || !Array.isArray(job.locations))) {
    throw new Error('岗位参考范围暂时无法核对，已停止展示，请重试。')
  }
  if (data.salary_references.some(item => item.kind !== 'estimate' || item.currency !== 'CNY'
    || item.period !== 'month' || !Number.isFinite(item.lower) || !Number.isFinite(item.upper)
    || item.lower < 0 || item.upper < item.lower || !Array.isArray(item.basis))) {
    throw new Error('参考薪资的估算口径暂时无法核对，已停止展示，请重试。')
  }
  if (data.skills.some(item => !Number.isInteger(item.skill_id) || typeof item.name !== 'string'
    || !item.evidence || typeof item.evidence.url !== 'string')
    || data.courses.some(item => typeof item.course_id !== 'string' || !item.course_id
      || !Array.isArray(item.skill_ids) || !Array.isArray(item.chapter_ids))
    || data.prerequisites.some(item => !Number.isInteger(item.from_skill_id)
      || !Number.isInteger(item.to_skill_id) || !item.evidence)) {
    throw new Error('课程与技能的资料关联暂时无法核对，请重新读取。')
  }
  return data
}
