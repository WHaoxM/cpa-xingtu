import { getApiMode } from './config'
import { httpDelete, httpFormPost, httpGet, httpPost } from './adapters/httpAdapter'
import { ApiError, type ApiEnvelope } from './types'

export type JsonRecord = Record<string, unknown>

export type StagedDataset = {
  id: string
  title: string
  status: string
  file_size?: number
  content_sha256?: string
  staged_record_count?: number
  created_at?: string
  uploaded_by?: string
}

export type StagedJobRecord = {
  title: string
  snapshot: JsonRecord
  [key: string]: unknown
}

export type StagedDatasetContent = {
  id: string
  content: StagedJobRecord[]
  file_size: number
  content_sha256: string
  staged_record_count: number
  published: boolean
  publication_count: number
  active_publication_count: number
}

export type JobReviewSummary = {
  review_id: string
  source_record_id: string
  review_version: string
  actor: 'model'
  status: 'blocked' | 'candidate_ready'
  blockers: string[]
  scoring_readiness: boolean
  publication_authorized: false
  content_sha256: string
  created_at: string
  source_current: string
}

export type JobReviewDetail = JobReviewSummary & {
  review: JsonRecord
  candidate_for_preview: JsonRecord | null
}

export type SourceListing = {
  id: number
  catalog_id: string
  listing_version: string
  content_sha256: string
  status: 'listed' | 'revoked'
  position_name: string
  listed_at: string
  source_uri: string
  source_record_sha256: string
  source_checked_at: string
  source_closes_at?: string | null
  match_eligible: false
  scoring_status: 'not_supported'
}

export type JobPublication = {
  id: number
  job_portrait_id: string
  publication_version: string
  content_sha256: string
  status: 'published' | 'revoked'
  position_name: string
  published_at: string
  source_uri: string
  source_fetched_at: string
  reviewed_at: string
}

export type PublicationPreview = {
  success: boolean
  status: 'preview_not_approved'
  job_portrait_id: string
  publication_version: string
  candidate_sha256: string
  source_text_sha256: string
  dataset_reference: {
    dataset_id: string
    record_index: number
    expected_dataset_sha256: string
    expected_record_sha256: string
  }
  snapshot_for_review: JsonRecord
  preview_token: string
  expires_in_seconds: number
  vacancy_validity: 'unknown'
  error?: string
  missing_job_fields?: string[]
}

function requireRealBackend(): void {
  if (getApiMode() !== 'http') {
    throw new ApiError('岗位资料需要连接真实服务端；当前演示模式不会显示或保存模拟岗位。')
  }
}

function unwrapData<T>(response: ApiEnvelope<T> | T): T {
  if (typeof response === 'object' && response !== null && 'data' in response) {
    return (response as ApiEnvelope<T>).data as T
  }
  return response as T
}

export async function listStagedDatasets(): Promise<StagedDataset[]> {
  requireRealBackend()
  const response = await httpGet<unknown>('/api/admin/dataset')
  const data = unwrapData<unknown>(response)
  if (Array.isArray(data)) return data as StagedDataset[]
  if (typeof data === 'object' && data !== null && 'items' in data) {
    const items = (data as { items?: unknown }).items
    if (Array.isArray(items)) return items as StagedDataset[]
  }
  return []
}

export async function uploadStagedDataset(file: File): Promise<StagedDataset & { content_sha256: string }> {
  requireRealBackend()
  const form = new FormData()
  form.append('title', file.name)
  form.append('category', 'admin-reviewed-jobs')
  form.append('file', file, file.name)
  const response = await httpFormPost<StagedDataset & { content_sha256: string; staged_record_count: number }>(
    '/api/admin/dataset/upload', form,
  )
  return unwrapData(response)
}

export async function readStagedDataset(id: string): Promise<StagedDatasetContent> {
  requireRealBackend()
  return unwrapData(await httpGet<StagedDatasetContent>(
    `/api/admin/dataset/${encodeURIComponent(id)}/content`,
  ))
}

export async function deleteStagedDataset(id: string): Promise<void> {
  requireRealBackend()
  await httpDelete(`/api/admin/dataset/${encodeURIComponent(id)}`)
}

export async function listJobReviews(status?: 'blocked' | 'candidate_ready') {
  requireRealBackend()
  return await httpGet<{ items: JobReviewSummary[]; total: number; has_more: boolean }>(
    '/api/admin/job-reviews', { status, limit: 100, offset: 0 },
  ) as unknown as { items: JobReviewSummary[]; total: number; has_more: boolean }
}

export async function getJobReview(reviewId: string): Promise<JobReviewDetail> {
  requireRealBackend()
  const response = await httpGet<JobReviewDetail>(`/api/admin/job-reviews/${encodeURIComponent(reviewId)}`)
  return response as unknown as JobReviewDetail
}

export async function listSourceListings(): Promise<{ items: SourceListing[]; total: number }> {
  requireRealBackend()
  return await httpGet<{ items: SourceListing[]; total: number }>('/api/admin/job-source-listings', {
    limit: 100, offset: 0,
  }) as unknown as { items: SourceListing[]; total: number }
}

export async function publishSourceOnly(payload: {
  review_id: string
  listing_version: string
  expected_review_sha256: string
  expected_source_record_sha256: string
  confirm_source_only: true
}) {
  requireRealBackend()
  return httpPost('/api/admin/job-source-listings', payload)
}

export async function revokeSourceListing(id: number, payload: { expected_content_sha256: string; reason: string }) {
  requireRealBackend()
  return httpPost(`/api/admin/job-source-listings/${id}/revoke`, payload)
}

export async function listJobPublications(): Promise<{ items: JobPublication[]; total: number }> {
  requireRealBackend()
  return await httpGet<{ items: JobPublication[]; total: number }>('/api/admin/job-publications', {
    limit: 100, offset: 0,
  }) as unknown as { items: JobPublication[]; total: number }
}

export async function previewStagedJobPublication(payload: {
  job_portrait_id: string
  publication_version: string
  source_dataset_id: string
  source_record_index: number
  expected_dataset_sha256: string
}): Promise<PublicationPreview> {
  requireRealBackend()
  const response = await httpPost<PublicationPreview>('/api/admin/job-publications/preview', payload)
  return response as unknown as PublicationPreview
}

export async function publishStagedJob(payload: {
  job_portrait_id: string
  publication_version: string
  source_dataset_id: string
  source_record_index: number
  expected_dataset_sha256: string
  expected_record_sha256: string
  preview_token: string
  expected_candidate_sha256: string
  expected_source_text_sha256: string
  confirm_review: {
    source_checked: true
    requirements_checked: true
    license_checked: true
    publish_exact_digest: true
  }
}) {
  requireRealBackend()
  return httpPost('/api/admin/job-publications', payload)
}

export async function revokeJobPublication(id: number, payload: { expected_content_sha256: string; reason: string }) {
  requireRealBackend()
  return httpPost(`/api/admin/job-publications/${id}/revoke`, payload)
}
