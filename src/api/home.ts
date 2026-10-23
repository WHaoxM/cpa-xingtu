import { getApiMode } from './config'
import { mockGet } from './adapters/mockAdapter'
import { httpGet } from './adapters/httpAdapter'

export type DashboardMetrics = {
  completed_courses: number
  weekly_completed_chapters: number
  week_start: string
}

export type DashboardPortrait = {
  state: string
  completeness: number | null
  dimensions: Record<'D1' | 'D2' | 'D3' | 'D4', number | null>
  scoring_eligible: boolean
  error?: string
}

export type DashboardActivity = {
  id: string
  type: 'course_completed' | 'career_report' | 'resume_confirmed' | 'resume_diagnostic'
  title: string
  occurred_at: string | null
  route: '/app/student/learning' | '/app/student/my-reports' | '/app/student/career-navigation'
  task_id?: string
  report_id?: string
  course_id?: string
  partial?: boolean
}

export type DashboardResume = {
  state: 'waiting_for_user' | 'queued' | 'parsing' | 'upload_failed' | 'analysis_running'
    | 'results_ready' | 'analysis_failed' | 'confirmed' | 'draft_only' | 'empty' | 'source_invalid' | 'unavailable'
  task_id: string | null
  confirmation_task_id: string | null
  based_on_previous_upload: boolean
  portrait_ready: boolean
  diagnostic_ready: boolean
  diagnostic_report_id: string | null
  has_analysis_failures: boolean
  draft: { state: 'saved' | 'empty' | 'unavailable'; revision: number | null; updated_at: string | null }
}

export type DashboardCareerDirection = {
  role_name: string
  description: string
  matched_skills?: string[]
  score?: number
}

export type DashboardLearningCourse = {
  course_id: string
  title: string | null
  chapter_count: number
  completed_chapters: number
  updated_at: string | null
}

export type DashboardLearning = {
  state: 'ready' | 'empty' | 'unavailable'
  courses: DashboardLearningCourse[]
}

export type StudentDashboard = {
  metrics: DashboardMetrics
  portrait: DashboardPortrait
  source_confirmation_task_id: string | null
  evidence: { has_verified_completed_report: boolean }
  recent_activities: DashboardActivity[]
  recent_activities_state?: 'ready' | 'partial'
  resume_continuation?: DashboardResume
  learning_continuation?: DashboardLearning
  // Only present in local mock mode; HTTP mode never reads fixture content.
  demo?: {
    career_directions: DashboardCareerDirection[]
    ai_suggestions: string[]
  }
}

export async function getStudentDashboard(): Promise<StudentDashboard> {
  const envelope = getApiMode() === 'mock'
    ? await mockGet<StudentDashboard>('home/dashboard.json')
    : await httpGet<StudentDashboard>('/api/home/dashboard')
  if (!envelope.data) throw new Error(envelope.error || '首页数据为空')
  return envelope.data
}
