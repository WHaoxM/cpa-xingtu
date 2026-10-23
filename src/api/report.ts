import type { ReportRecord } from '@/types'
import { getApiMode, DEMO_STUDENT_ID } from './config'
import { mockGet, mockMutate } from './adapters/mockAdapter'
import { httpGet, httpPost } from './adapters/httpAdapter'
import { mapReportRecord } from './mappers'
import type { DecisionEnvelope } from './match'

export async function generateComparisonReport(jobId: string): Promise<DecisionEnvelope> {
  if (getApiMode() !== 'http') throw new Error('岗位报告需要连接真实服务端')
  return httpPost('/api/report/generate', { job_portrait_id: jobId }) as Promise<DecisionEnvelope>
}

export async function getReportList(userId?: string): Promise<ReportRecord[]> {
  if (getApiMode() === 'mock') {
    const studentId = userId || DEMO_STUDENT_ID
    const env = await mockGet(`report/list.${studentId}.json`)
    return (env.data as unknown[] | undefined)?.map(mapReportRecord) ?? []
  }
  // In HTTP mode the authenticated session is the authority. Do not send a
  // client-selected student_id (including a demo fallback) as identity input.
  const env = await httpGet('/api/report/list')
  return (env.data as unknown[] | undefined)?.map(mapReportRecord) ?? []
}

/** Count only server-persisted completed reports for the backend-connected UI. */
export async function getCompletedReportCount(studentId: string): Promise<number> {
  if (getApiMode() === 'mock') {
    return (await getReportList(studentId)).length
  }
  const env = await httpGet<unknown[]>('/api/report/list', {
    status: 'completed',
  })
  return Number(env.total ?? env.count ?? 0)
}

export async function getReportDetail(id: string): Promise<ReportRecord | null> {
  if (getApiMode() === 'mock') {
    try {
      const env = await mockGet(`report/detail.${id}.json`)
      return env.data ? mapReportRecord(env.data) : null
    } catch {
      return null
    }
  }
  const env = await httpGet(`/api/report/${encodeURIComponent(id)}`)
  return env.data ? mapReportRecord(env.data) : null
}

/** Paginated shelf data; unlike the legacy array helper, retains the total. */
export async function getReportShelfPage(limit: number, offset: number) {
  const env = await httpGet<unknown[]>('/api/report/list', { limit, offset })
  if (!env.success || !Array.isArray(env.data) || !Number.isSafeInteger(Number(env.total))) {
    throw new Error('报告目录暂时不可用，请重试')
  }
  return { items: env.data.map(row => {
    const item = mapReportRecord(row)
    return { ...item, title: item.title && item.title !== item.id ? item.title : '岗位对照报告' }
  }), total: Number(env.total) }
}

/**
 * Local/demo create: mock returns a synthetic id.
 * Real generate is heavy-excluded — do not call POST /api/report/generate here.
 */
export async function createReport(
  data: Omit<ReportRecord, 'id' | 'createdAt'>,
): Promise<ReportRecord> {
  if (getApiMode() === 'mock') {
    await mockMutate('report/list.student_001.json')
  }
  return {
    ...data,
    id: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    createdAt: new Date().toISOString().slice(0, 10),
  }
}

/** Backend has no delete route yet — local no-op / optimistic UI. */
export async function deleteReport(id: string): Promise<void> {
  void id
}

export async function fetchPortraitReports(): Promise<ReportRecord[]> {
  const all = await getReportList()
  return all.filter(item => item.type === 'portrait')
}

export async function fetchCareerReports(): Promise<ReportRecord[]> {
  const all = await getReportList()
  return all.filter(item => item.type === 'career')
}

export async function fetchReportDetail(id: string): Promise<ReportRecord | null> {
  return getReportDetail(id)
}

/** Explicit heavy path — callers must opt in; not used by default UI. */
export async function generateReportHeavy(body: {
  student_id: string
  job_portrait_id: string
  title?: string
  type?: string
}) {
  if (getApiMode() === 'mock') {
    return {
      success: true,
      data: { report_id: 'report_mock_new', status: 'pending' },
    }
  }
  return httpPost('/api/report/generate', body)
}

/** Resume-only report generated from the current server-confirmed resume version. */
export type ResumeDiagnosticEvidenceRef = {
  page?: number
  block_id?: string
  quote?: string
}

export type ResumeDiagnosticItem = {
  id: string
  label: string
  fields: Record<string, unknown> | string | null
  evidence_refs: ResumeDiagnosticEvidenceRef[]
  evidence_status: 'page_located' | 'confirmed_profile_only' | string
}

export type ResumeDiagnosticChapter = {
  id: string
  title: string
  items: ResumeDiagnosticItem[]
  status?: string
  reason?: string | null
  notice?: string
}

export type ResumeDiagnosticInterpretation = {
  text: string
  evidence_ids: string[]
  /** Exact source remains separate from the interpretation and full fact chapters. */
  source_quotes?: { evidence_id: string; text: string }[]
  kind?: 'unclear_expression' | 'missing_information' | 'incomplete_reading'
  problem?: string
  why?: string
}

export type ResumeDiagnosticReport = {
  report_id: string
  report_type: 'resume_diagnostic'
  status: 'completed' | 'partial'
  source_confirmation_task_id: string
  coverage: {
    page_count: number | null
    observed_pages: number[]
    missing_pages: number[]
    accuracy_verified: boolean
  }
  chapters: ResumeDiagnosticChapter[]
  analysis?: {
    summary?: ResumeDiagnosticInterpretation | null
    strengths?: ResumeDiagnosticInterpretation[]
    questions?: ResumeDiagnosticInterpretation[]
  } | null
  analysis_status?: string
  analysis_content_status?: 'current' | 'legacy'
  improvements?: ResumeImprovement[]
  improvements_status?: string
  improvements_version?: number
  quality_status?: string
  limitations: string[]
  missing_sections: string[]
  /** Resume-derived direction hypotheses are distinct from verified published openings. */
  job_catalog?: {
    status: 'ready' | 'empty' | 'unavailable' | string
    catalog_version?: string | null
    catalog_latest_published_at?: string | null
    total?: number
    has_more?: boolean
    items?: PublishedJobCard[]
  } | null
}

export type ResumeImprovement = {
  id: string; title: string; evidence_id: string
  target: 'basic' | 'projects' | 'skills' | 'education' | 'honors'
  kind: 'unclear_expression' | 'missing_information' | 'incomplete_reading'
  problem: string; why: string; questions: string[]; outline: string
  source_text: string; evidence_refs: { quote: string; block_id?: string; page?: number }[]
}

export type PublishedJobCard = {
  job_portrait_id: string
  publication_version?: number | string
  content_sha256?: string
  position_name: string
  source_uri?: string | null
  source_fetched_at?: string | null
  reviewed_at?: string | null
  published_at?: string | null
  source_license?: string | null
  publication_status: 'published'
  vacancy_validity: 'unknown' | 'current' | 'expired' | string
}

type ResumeDiagnosticEnvelope = {
  success: boolean
  status?: 'completed' | 'partial' | 'needs_input' | 'stale'
  data?: ResumeDiagnosticReport
  error?: string
  next_action?: string
}

/** Generate (idempotently) and read the current report for the authenticated user. */
export async function generateResumeDiagnosticReport(): Promise<ResumeDiagnosticEnvelope> {
  return httpPost<ResumeDiagnosticReport>('/api/report/resume-diagnostic') as Promise<ResumeDiagnosticEnvelope>
}

export async function getLatestResumeDiagnosticReport(): Promise<ResumeDiagnosticEnvelope> {
  return httpGet<ResumeDiagnosticReport>('/api/report/resume-diagnostic') as Promise<ResumeDiagnosticEnvelope>
}

export async function getResumeDiagnosticReport(reportId: string): Promise<ResumeDiagnosticEnvelope> {
  return httpGet<ResumeDiagnosticReport>(`/api/report/resume-diagnostic/${encodeURIComponent(reportId)}`) as Promise<ResumeDiagnosticEnvelope>
}
