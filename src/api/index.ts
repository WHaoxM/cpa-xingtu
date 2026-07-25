export { getApiMode, isMockMode, getApiBaseUrl, DEMO_STUDENT_ID } from './config'
export { ApiError } from './types'
export type { ApiEnvelope } from './types'

export * as authApi from './auth'
export * as careerApi from './career'
export * as profileApi from './profile'
export * as favoritesApi from './favorites'
export * as reportApi from './report'
export * as agentApi from './agent'
export * as learningApi from './learning'
export * as adminApi from './admin'
export * as pipelineApi from './pipeline'
export * as abilityApi from './ability'
export * as courseSystemApi from './courseSystem'
export * as messagesApi from './messages'

// Backward-compatible report surface (stores import from `@/api/report`)
export {
  getReportList,
  getReportDetail,
  createReport,
  deleteReport,
  fetchPortraitReports,
  fetchCareerReports,
  fetchReportDetail,
} from './report'
