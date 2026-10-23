import { getApiMode } from './config'
import { mockGet } from './adapters/mockAdapter'
import { httpGet, httpPost } from './adapters/httpAdapter'

export type LandscapeCategory = {
  category: string
  role_count: number
  avg_salary_range: string
  roles: string[]
}

export type CareerInsight = {
  role_name: string
  category?: string
  avg_salary_low?: number
  avg_salary_high?: number
  demand_level?: string
  core_skills?: string[]
}

export async function getLandscape(): Promise<LandscapeCategory[]> {
  if (getApiMode() === 'mock') {
    const env = await mockGet<LandscapeCategory[]>('career/landscape.json')
    return env.data ?? []
  }
  const env = await httpGet<LandscapeCategory[]>('/api/career/landscape')
  return env.data ?? []
}

export async function listInsights(params?: {
  limit?: number
  offset?: number
  category?: string
}): Promise<CareerInsight[]> {
  if (getApiMode() === 'mock') {
    const env = await mockGet<CareerInsight[]>('career/insights.list.json')
    return env.data ?? []
  }
  const env = await httpGet<CareerInsight[]>('/api/career/insights', params)
  return env.data ?? []
}

export async function exploreCareers(q: string, topK = 5) {
  if (getApiMode() === 'mock') {
    return mockGet('career/explore.json')
  }
  // Interest Explore only — short keywords. Resume → use inferRoleFromSkills.
  return httpGet('/api/career/explore', { q, top_k: topK })
}

export type InferRoleSkill = string | { name: string; confidence?: number; weight?: number; category?: string }

export type InferRoleCandidate = {
  role_name: string
  score: number
  coverage?: number
  matched_skills?: string[]
  missing_core_skills?: string[]
  sources?: string[]
  category?: string | null
  demand_level?: string | null
}

export type InferRoleResult = {
  predicted_role: string | null
  confidence: number
  candidates: InferRoleCandidate[]
  skill_count?: number
  canonical_skills?: string[]
  evidence_summary?: string
  status?: 'complete' | 'partial' | 'empty'
  partial_reasons?: string[]
  source_coverage?: Record<string, string>
  market_data_status?: string
  failed_sources?: string[]
}

export type SkillExplorationRoles = {
  source_confirmation_task_id: string
  revision: number
  source_kind: 'user_self_report'
  scoring_eligible: false
  exploration_only: true
  roles: InferRoleResult
}

export type ConfirmedResumeRoles = {
  source_confirmation_task_id: string
  source_kind: 'confirmed_resume'
  scoring_eligible: false
  exploration_only: true
  roles: InferRoleResult
}

/** Owner-bound direction exploration from the confirmed resume stored on the server. */
export async function inferConfirmedResumeRoles(taskId: string, preferredRole?: string): Promise<ConfirmedResumeRoles> {
  if (!/^task_[A-Za-z0-9]+$/.test(taskId)) throw new Error('无效的简历任务引用')
  const env = await httpPost<ConfirmedResumeRoles>('/api/profile/student/confirmed-resume/roles', {
    task_id: taskId, preferred_role: preferredRole,
  })
  if (!env.data) throw new Error(env.error || '简历方向结果不可用')
  return env.data
}

/** Owner-bound direction exploration from saved self-reported skills, not L2 input. */
export async function inferSelfReportedSkillRoles(taskId: string, preferredRole?: string): Promise<SkillExplorationRoles> {
  if (!/^task_[A-Za-z0-9]+$/.test(taskId)) throw new Error('无效的简历任务引用')
  const env = await httpPost<SkillExplorationRoles>('/api/profile/student/skill-exploration/roles', {
    task_id: taskId, preferred_role: preferredRole,
  })
  if (!env.data) throw new Error(env.error || '技能自述方向结果不可用')
  return env.data
}

/** Role Inference seam: extracted skills → ranked career directions (not resume text). */
export async function inferRoleFromSkills(body: {
  skills: InferRoleSkill[]
  top_k?: number
  preferred_role?: string
}): Promise<InferRoleResult> {
  if (getApiMode() === 'mock') {
    const names = (body.skills || [])
      .map(s => (typeof s === 'string' ? s : s.name))
      .filter(Boolean)
    // Mock returns catalog-style roles (not collapsed UI domains)
    const guess =
      body.preferred_role ||
      (names.some(n => /RAG|向量|LangChain/i.test(n))
        ? 'RAG工程师'
        : names.some(n => /Agent|Prompt/i.test(n))
          ? 'AI智能体工程师'
          : names.some(n => /PyTorch|Transformer|大模型|机器学习/i.test(n))
            ? '大模型算法工程师'
            : names.some(n => /Vue|React|TypeScript/i.test(n))
              ? '前端开发'
              : '后端开发')
    return {
      predicted_role: guess,
      confidence: 0.78,
      candidates: [
        {
          role_name: guess,
          score: 2.1,
          coverage: 0.72,
          matched_skills: names.slice(0, 5),
          missing_core_skills: [],
          sources: ['mock', 'neo4j_requires'],
        },
      ],
      skill_count: names.length,
      evidence_summary: `mock; top=${guess}`,
    }
  }
  const env = await httpPost<InferRoleResult>('/api/career/infer-role', {
    skills: body.skills,
    top_k: body.top_k ?? 5,
    preferred_role: body.preferred_role,
  })
  return (
    env.data ?? {
      predicted_role: null,
      confidence: 0,
      candidates: [],
      skill_count: 0,
    }
  )
}

export async function submitAssessment(body: {
  student_id: string
  assessed_skills?: string[]
  assessed_abilities?: Record<string, number>
  target_role?: string
}) {
  if (getApiMode() === 'mock') {
    return {
      success: true,
      data: {
        assessment_id: 'assess_mock_001',
        weak_skills: (body.assessed_skills ?? []).slice(0, 3),
        recommended_roles: body.target_role ? [body.target_role] : [],
      },
    }
  }
  return httpPost('/api/career/assessment', body)
}

export interface ReflectionDirection { id: string; label: string; group: string }
export interface ReflectionQuestion { id: string; label: string }
export interface ReflectionOption { id: string; label: string; group: 'not_started' | 'concept' | 'practice' | 'unknown' }
export interface ReflectionQuestionnaire {
  version: string
  direction: ReflectionDirection
  questions: ReflectionQuestion[]
  options: ReflectionOption[]
}
export interface ReflectionSnapshot {
  direction: ReflectionDirection
  questionnaire_version: string
  questions: ReflectionQuestion[]
  options: ReflectionOption[]
  answers: Record<string, string>
}
export interface ReflectionRecord {
  assessment_id: string
  submission_id?: string
  created_at?: string
  reflection?: ReflectionSnapshot
  weak_skills?: string[]
}
export interface ReflectionSubmission {
  assessment_kind: 'self_reflection'
  submission_id: string
  direction_id: string
  questionnaire_version: string
  answers: Record<string, string>
}
export const listReflectionDirections = () => httpGet<{version: string; directions: ReflectionDirection[]}>('/api/career/assessment/questionnaire')
export const getReflectionQuestionnaire = (direction: string) => httpGet<ReflectionQuestionnaire>('/api/career/assessment/questionnaire', {direction_id: direction})
export const getLatestReflection = (owner: string) => httpGet<ReflectionRecord>(`/api/career/assessment/${encodeURIComponent(owner)}`)
export const saveSelfReflection = (body: ReflectionSubmission) => httpPost<ReflectionRecord>('/api/career/assessment', body)
