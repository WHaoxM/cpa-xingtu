import { getApiMode } from './config'
import { mockGet } from './adapters/mockAdapter'
import { httpGet, httpPost, httpFormPost } from './adapters/httpAdapter'

export type ParseUploadData = {
  text?: string
  student_id?: string
  block_count?: number
  skills?: unknown[]
  skill_count?: number
  metadata?: Record<string, unknown>
  name?: string
  education?: Array<{ school?: string; major?: string; degree?: string }>
  contact?: Record<string, string>
  raw_text?: string
}

export type ResumeCandidate = {
  task_id: string
  student_id: string
  status: 'needs_input' | 'partial' | 'failed' | 'completed'
  confirmed?: boolean
  candidate_profile?: Record<string, unknown>
  structure_validation?: { ok?: boolean; issues?: string[] }
  source_evidence?: {
    page_count?: number
    observed_pages?: number[]
    missing_pages?: number[]
    engine?: string
    blocks?: Array<{ block_id: string; text: string; page: number; block_type: string }>
  }
  next_action?: string
  profile_ready?: boolean
  portrait_needs_refresh?: boolean
  user_self_report?: UserSelfReport | null
  skill_exploration?: SkillExploration | null
  portrait_task?: {
    task_id: string
    status: string
    next_action?: string
    summary?: string
    missing_fields?: string[]
    portrait_candidate?: Record<string, unknown>
    portrait_id?: string | number | null
    portrait?: Record<string, unknown> | null
    action_available?: boolean
    resume_state?: string
  } | null
}

export type StudentWorkbenchState = {
  run: { state: 'not_started' | 'queued' | 'running' | 'waiting_for_user' | 'settled' | 'failed'; task_id: string | null; l0_status?: string }
  source_confirmation_task_id: string | null
  based_on_previous_upload: boolean
  analysis_run: { state: 'not_started' | 'running' | 'settled'; portrait_task_id: string | null; diagnostic_task_id: string | null; has_failures: boolean }
  resume_diagnostic: { state: 'not_started' | 'processing' | 'ready' | 'partial' | 'failed' | 'stale'; report_id: string | null; task_id?: string; missing_sections?: string[]; next_action?: string }
  portrait: {
    state: 'not_started' | 'processing' | 'failed' | 'stale' | 'ready_with_unknowns' | 'ready_scored'
    task_id: string | null
    portrait_id?: string | number | null
    snapshot_id?: string | null
    dimensions: Record<'D1' | 'D2' | 'D3' | 'D4', number | null>
    missing_fields: string[]
    scoring_eligible: boolean
    next_action?: string | null
  }
}

export async function getStudentWorkbenchState() {
  return httpGet<StudentWorkbenchState>('/api/profile/student/workbench')
}

export type PortraitSnapshot = {
  snapshot_id: string
  source_task_id: string
  source_confirmation_task_id: string
  source_self_report_revision: number
  target_job_id: string | null
  state: 'ready_with_unknowns' | 'ready_scored'
  scoring_eligible: boolean
  is_current: boolean
  dimensions: Record<'D1' | 'D2' | 'D3' | 'D4', number | null>
  missing_fields: string[]
  created_at: string
  portrait?: Record<string, unknown>
}

export async function getStudentPortraitSnapshots() {
  return httpGet<{ current_snapshot_id: string | null; items: PortraitSnapshot[] }>(
    '/api/profile/student/portrait-snapshots', { limit: 20 })
}

export async function getStudentPortraitSnapshot(snapshotId: string) {
  if (!/^ps_[0-9a-f]{32}$/.test(snapshotId)) throw new Error('无效的画像版本')
  return httpGet<PortraitSnapshot>(`/api/profile/student/portrait-snapshots/${snapshotId}`)
}

export type SelfReportItem = { level: '强' | '中' | '弱'; example: string } | null
export type UserSelfReport = {
  source_confirmation_task_id: string
  revision: number
  source_kind: 'user_self_report'
  updated_at: string
  items: Record<string, SelfReportItem>
  portrait_analysis?: { task_id: string; delivery: string }
}

export type SkillExploration = {
  source_confirmation_task_id: string
  revision: number
  source_kind: 'user_self_report'
  scoring_eligible: false
  updated_at: string
  skills: string[]
}

export async function saveStudentSkillExploration(taskId: string, expectedRevision: number,
  skills: string[]) {
  if (!/^task_[A-Za-z0-9]+$/.test(taskId)) throw new Error('无效的简历任务引用')
  return httpPost<SkillExploration>('/api/profile/student/skill-exploration', {
    task_id: taskId, expected_revision: expectedRevision, skills,
  })
}

export async function saveStudentSelfReport(taskId: string, expectedRevision: number,
  items: Record<string, SelfReportItem>) {
  if (!/^task_[A-Za-z0-9]+$/.test(taskId)) throw new Error('无效的简历任务引用')
  return httpPost<UserSelfReport>('/api/profile/student/self-report', {
    task_id: taskId, expected_revision: expectedRevision, items,
  })
}

export type ConfirmedPipelineResult = {
  task_id: string
  student_id?: string
  status?: string
  resource_type?: string
  resource_id?: string
  profile_ready?: boolean
  portrait_ready?: boolean
  next_action?: string
  summary?: string
  missing_fields?: string[]
  portrait_candidate?: Record<string, unknown>
  portrait?: Record<string, unknown> | null
  portrait_id?: string | number | null
  [key: string]: unknown
}

export type PipelineTaskEvent = {
  event_id: number
  task_id: string
  type: 'pipeline.status'
  status: string
  occurred_at: string
}

export type ResumeTraceEvent = {
  event_id: number
  stage: string
  kind: 'input' | 'attempt' | 'tool_call' | 'tool_result' | 'agent_run' | 'model_call' | 'agent_result' | 'handoff' | 'artifact' | 'error'
  /** null is the upload receipt or a legacy event with no reliable attempt boundary. */
  attempt: number | null
  actor: string
  state: 'running' | 'completed' | 'failed'
  progress: number
  source: string
  target: string
  facts: Record<string, string | number | boolean | null>
  occurred_at: string
}

export type ResumeTracePage = {
  task: { task_id: string; pipeline: string; status: string; progress: number; current_attempt: number }
  events: ResumeTraceEvent[]
  cursor: number
  has_more: boolean
  progress_basis: string
}

export async function getResumeTrace(taskId: string, cursor = 0) {
  if (!/^task_[A-Za-z0-9]+$/.test(taskId)) throw new Error('无效的简历任务引用')
  return httpGet<ResumeTracePage>(`/api/pipeline/trace/${encodeURIComponent(taskId)}`, { cursor })
}

export type PipelineEventPage = {
  task: { task_id: string; pipeline: string; status: string }
  events: PipelineTaskEvent[]
  cursor: number
  has_more: boolean
  resume_state: 'not_available'
}

/** Cursor-based replay of MySQL-committed business transitions, not a progress estimate. */
export async function getPipelineEvents(taskId: string, cursor = 0) {
  if (!/^task_[A-Za-z0-9]+$/.test(taskId)) throw new Error('无效的任务引用')
  return httpGet<PipelineEventPage>(`/api/pipeline/events/${encodeURIComponent(taskId)}`, { cursor })
}

/** Same PipelineRunner L0 entry used by the main Agent; never a completed profile on upload. */
export async function uploadResumeCandidate(file: File) {
  if (getApiMode() === 'mock') throw new Error('mock 模式不使用真实确认管线')
  const form = new FormData()
  form.append('file', file)
  return httpFormPost<ResumeCandidate>('/api/profile/student/upload', form)
}

/** Accept a durable L0 task immediately; result and real checkpoints are replayed separately. */
export async function startResumeCandidate(file: File) {
  if (getApiMode() === 'mock') throw new Error('mock 模式不使用真实确认管线')
  const form = new FormData()
  form.append('file', file)
  return httpFormPost<{ task_id: string; student_id: string; filename: string;
    status: 'pending'; progress: 0; delivery: 'queued' | 'retry_pending' }>(
    '/api/profile/student/upload', form, { async: 1 })
}

/** Resolve a chat artifact reference through the server owner check. */
export async function getResumeCandidate(taskId: string) {
  if (!/^task_[A-Za-z0-9]+$/.test(taskId)) throw new Error('无效的简历任务引用')
  return httpGet<ResumeCandidate>(`/api/profile/student/candidate/${encodeURIComponent(taskId)}`)
}

export async function confirmResumeCandidate(taskId: string, acknowledgePartial = false) {
  return httpPost<ConfirmedPipelineResult>('/api/profile/student/confirm', {
    task_id: taskId,
    confirmed: true,
    acknowledge_partial: acknowledgePartial,
  })
}

export async function runConfirmedStudentPipeline(
  pipeline: 'L2_generate_portrait',
  options: { job_id?: string; job_portrait_id?: string; title?: string } = {},
) {
  return httpPost<ConfirmedPipelineResult>('/api/profile/student/pipeline', { pipeline, ...options })
}

export type ExtractedSkill = {
  name: string
  category?: string
  confidence?: number
  level?: string
}

export type StudentPortraitApi = {
  student_id?: string
  name?: string
  D1_basic?: { dimension_score?: number; evidence?: string[]; school_tier?: string; major_category?: string }
  D2_skill?: { dimension_score?: number; skill_coverage?: number; evidence?: string[] }
  D3_quality?: { dimension_score?: number; confidence?: number; evidence?: string[] }
  D4_potential?: { dimension_score?: number; evidence?: string[] }
  summary?: {
    competitiveness_score?: number
    competitiveness_level?: string
    completeness_score?: number
  }
  generated_at?: string
}

export async function parseResumeText(body: {
  text: string
  student_id?: string
  source?: string
}) {
  if (getApiMode() === 'mock') {
    return mockGet('pipeline/parse.text.json')
  }
  return httpPost('/api/pipeline/ext/parse/text', body)
}

export async function uploadResumeFile(
  file: File,
  opts?: { extractSkills?: boolean },
) {
  if (getApiMode() === 'mock') {
    return mockGet<ParseUploadData>('pipeline/parse.text.json')
  }
  const form = new FormData()
  form.append('file', file)
  if (opts?.extractSkills) form.append('extract_skills', 'true')
  return httpFormPost<ParseUploadData>('/api/pipeline/ext/parse/upload/resume', form)
}

export async function uploadJdFile(
  file: File,
  opts?: { extractSkills?: boolean },
) {
  if (getApiMode() === 'mock') {
    return mockGet<ParseUploadData>('pipeline/parse.text.json')
  }
  const form = new FormData()
  form.append('file', file)
  if (opts?.extractSkills) form.append('extract_skills', 'true')
  return httpFormPost<ParseUploadData>('/api/pipeline/ext/parse/upload/jd', form)
}

export async function extractSkillsOnly(body: {
  text: string
  use_llm?: boolean
}) {
  if (getApiMode() === 'mock') {
    return mockGet<{ skills: ExtractedSkill[]; skill_count: number }>('pipeline/parse.text.json')
  }
  // Default ON: dictionary-only extract is the shallow path that produced generic ML tags
  return httpPost<{ skills: ExtractedSkill[]; skill_count: number }>(
    '/api/pipeline/ext/extract/skills',
    { text: body.text, use_llm: body.use_llm ?? true },
  )
}

export type StructureValidation = {
  ok: boolean
  issues?: string[]
  school?: string
  major?: string
  competition_count?: number
  project_count?: number
  raw_text_chars?: number
  structure_path?: string
}

export type NsleResumeData = {
  skills?: Array<string | ExtractedSkill>
  entities?: Record<string, unknown>
  student_profile?: Record<string, unknown>
  structure_validation?: StructureValidation
  blocks?: unknown[]
}

/** NS-LE LLM resume extract → entities + Portrait student_profile */
export async function nsleResume(body: { text: string }) {
  if (getApiMode() === 'mock') {
    return mockGet<NsleResumeData>('pipeline/parse.text.json')
  }
  return httpPost<NsleResumeData>('/api/pipeline/ext/nsle/resume', body)
}

export async function createStudentPortrait(body: {
  student_id: string
  skills: ExtractedSkill[]
  student_profile?: Record<string, unknown>
  target_job_id?: string
  target_job_skills?: ExtractedSkill[]
}) {
  if (getApiMode() === 'mock') {
    return mockGet<StudentPortraitApi>('profile/student.4d.student_001.json')
  }
  return httpPost<StudentPortraitApi>('/api/pipeline/ext/portrait/student', body)
}

export async function saveStudentPortrait(body: Record<string, unknown>) {
  if (getApiMode() === 'mock') {
    return { success: true, data: { saved: true } }
  }
  return httpPost('/api/pipeline/ext/save/student-portrait', body)
}

export async function triggerPipeline(body: {
  pipeline: string
  student_id?: string
  [key: string]: unknown
}) {
  if (getApiMode() === 'mock') {
    return mockGet('pipeline/status.sample.json')
  }
  return httpPost('/api/pipeline/trigger', body)
}

export async function getPipelineStatus(taskId: string) {
  if (getApiMode() === 'mock') {
    return mockGet('pipeline/status.sample.json')
  }
  return httpGet(`/api/pipeline/status/${encodeURIComponent(taskId)}`)
}

export async function listPipelines() {
  if (getApiMode() === 'mock') {
    return mockGet('pipeline/list.json')
  }
  return httpGet('/api/pipeline/list')
}

/** Poll until completed/failed or timeout. */
export async function waitPipelineTask(
  taskId: string,
  opts?: { intervalMs?: number; timeoutMs?: number },
) {
  const interval = opts?.intervalMs ?? 800
  const timeout = opts?.timeoutMs ?? 60_000
  const started = Date.now()
  while (Date.now() - started < timeout) {
    const env = await getPipelineStatus(taskId)
    const status = String((env.data as { status?: string } | undefined)?.status || '')
    if (status === 'completed' || status === 'failed') return env
    await new Promise(r => setTimeout(r, interval))
  }
  throw new Error('管线任务超时')
}
