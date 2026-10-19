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
  type: 'course_completed' | 'career_report'
  title: string
  occurred_at: string | null
  route: '/app/student/learning' | '/app/student/my-reports'
}

export type DashboardCareerDirection = {
  role_name: string
  description: string
  matched_skills?: string[]
  score?: number
}

export type StudentDashboard = {
  metrics: DashboardMetrics
  portrait: DashboardPortrait
  source_confirmation_task_id: string | null
  evidence: { has_verified_completed_report: boolean }
  recent_activities: DashboardActivity[]
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
