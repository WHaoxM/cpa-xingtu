import { getApiMode } from './config'
import { httpGet } from './adapters/httpAdapter'
import { ApiError } from './types'

export type JobCatalogItem = {
  portrait_id?: string
  job_portrait_id: string
  publication_version?: string
  listing_version?: string
  content_sha256?: string
  position_name: string
  source_uri?: string
  source_fetched_at?: string
  source_verified_at?: string
  reviewed_at?: string
  publication_status: 'published' | 'source_only' | string
  vacancy_validity?: 'unknown' | string
  match_eligible?: boolean
  scoring_status?: string
  source_record_id?: string
  source_record?: Record<string, unknown>
  portrait_json?: Record<string, unknown> | null
  [key: string]: unknown
}

export type JobCatalogResponse = {
  success: boolean
  status: 'complete' | 'empty' | 'partial' | 'unavailable' | string
  data: JobCatalogItem[]
  count: number
  total: number
  limit: number
  offset: number
  failed_sources?: string[]
  retry_after_seconds?: number | null
  error?: string
}

function requireRealBackend(): void {
  if (getApiMode() !== 'http') {
    throw new ApiError('岗位目录只显示服务端已发布资料；请连接平台后端后重试。')
  }
}

export async function listJobCatalog(query: { keyword?: string; limit?: number; offset?: number } = {}) {
  requireRealBackend()
  const limit = query.limit ?? 20
  const offset = query.offset ?? 0
  const path = query.keyword?.trim() ? '/api/profile/job/search' : '/api/profile/job/list'
  return await httpGet<JobCatalogResponse>(path, {
    ...(query.keyword?.trim() ? { keyword: query.keyword.trim() } : {}),
    limit,
    offset,
  }) as unknown as JobCatalogResponse
}

export async function getJobCatalogDetail(id: string) {
  requireRealBackend()
  const response = await httpGet<JobCatalogItem>(`/api/profile/job/${encodeURIComponent(id)}`)
  if (!response.data) throw new ApiError('没有读到岗位详情，请刷新后重试。')
  return response.data
}
