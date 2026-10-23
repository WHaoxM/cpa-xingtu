import type { SavedJob, TargetRole, TargetRoleMarket } from '@/types'
import { getApiMode } from './config'
import { mockGet, mockMutate } from './adapters/mockAdapter'
import { httpDelete, httpGet, httpPost } from './adapters/httpAdapter'
import { ApiError } from './types'
import {
  mapSavedJob,
  mapTargetRole,
  mapTargetRoleMarket,
  mergeTargetRoleMarket,
  toSavedJobBody,
} from './mappers'

const ROLE_MARKET_FIXTURE: Record<string, string> = {
  前端开发: 'favorites/role-market.frontend.json',
  后端开发: 'favorites/role-market.backend.json',
}

export async function listSavedJobs(userId: string): Promise<SavedJob[]> {
  if (getApiMode() === 'mock') {
    const env = await mockGet('favorites/saved-jobs.list.json')
    return (env.data as unknown[] | undefined)?.map(mapSavedJob) ?? []
  }
  const env = await httpGet('/api/saved-jobs', { user_id: userId })
  return (env.data as unknown[] | undefined)?.map(mapSavedJob) ?? []
}

export async function createSavedJob(userId: string, job: SavedJob): Promise<void> {
  if (getApiMode() === 'mock') {
    await mockMutate('favorites/saved-jobs.create.ok.json')
    return
  }
  await httpPost('/api/saved-jobs', toSavedJobBody(job, userId))
}

export type PublishedJobFavoriteResult = {
  saved_job_id: number | string
  job_portrait_id: string
  publication_version: string
  publication_status: string
  vacancy_validity: 'unknown' | string
  message: string
}

/** Save one exact, server-published version. Never accepts client job facts. */
export async function createPublishedJobFavorite(reference: {
  job_portrait_id: string
  publication_version: string
  content_sha256: string
}): Promise<PublishedJobFavoriteResult> {
  if (getApiMode() !== 'http') {
    throw new ApiError('只有连接平台服务端后才能收藏岗位目录资料。')
  }
  const response = await httpPost<PublishedJobFavoriteResult>('/api/saved-jobs', {
    publication_ref: reference,
  })
  if (!response.success || !response.data?.saved_job_id) {
    throw new ApiError('服务端没有确认收藏成功，请稍后重新读取。', 503, response, 'http')
  }
  return response.data
}

export async function deleteSavedJob(jobId: string): Promise<void> {
  if (getApiMode() === 'mock') {
    await mockMutate('favorites/saved-jobs.delete.ok.json')
    return
  }
  await httpDelete(`/api/saved-jobs/${encodeURIComponent(jobId)}`)
}

/** Delete one exact owner-scoped favorite record, not every version of a job. */
export async function deleteSavedJobRecord(savedJobId: string | number): Promise<void> {
  if (getApiMode() !== 'http') {
    throw new ApiError('按记录删除仅适用于真实服务端收藏。')
  }
  await httpDelete(`/api/saved-jobs/records/${encodeURIComponent(String(savedJobId))}`)
}

export async function listTargetRoles(userId: string): Promise<TargetRole[]> {
  if (getApiMode() === 'mock') {
    const env = await mockGet('favorites/target-roles.list.json')
    return (env.data as unknown[] | undefined)?.map(mapTargetRole) ?? []
  }
  const env = await httpGet('/api/target-roles', { user_id: userId })
  return (env.data as unknown[] | undefined)?.map(mapTargetRole) ?? []
}

/** Always sends `role_name`; backend also accepts `role` alias. */
export async function addTargetRole(
  userId: string,
  roleName: string,
  priority = 1,
): Promise<void> {
  if (getApiMode() === 'mock') {
    await mockMutate('favorites/target-roles.create.ok.json')
    return
  }
  await httpPost('/api/target-roles', {
    user_id: userId,
    role_name: roleName,
    priority,
  })
}

export async function deleteTargetRole(userId: string, roleName: string): Promise<void> {
  if (getApiMode() === 'mock') {
    await mockMutate('favorites/target-roles.delete.ok.json')
    return
  }
  await httpDelete(`/api/target-roles/${encodeURIComponent(roleName)}`, {
    user_id: userId,
  })
}

export async function getTargetRoleMarket(role: string): Promise<TargetRoleMarket | null> {
  if (getApiMode() === 'mock') {
    const fixture = ROLE_MARKET_FIXTURE[role] ?? 'favorites/role-market.frontend.json'
    const env = await mockGet(fixture)
    return mapTargetRoleMarket(env.data, role)
  }
  const env = await httpGet(`/api/target-role-market/${encodeURIComponent(role)}`)
  return mapTargetRoleMarket(env.data ?? null, role)
}

/** API market + optional local fallback for any still-empty presentation fields. */
export async function getTargetRoleMarketCard(
  role: string,
  fallback?: TargetRoleMarket | null,
): Promise<TargetRoleMarket | null> {
  const remote = await getTargetRoleMarket(role)
  if (!fallback) return remote
  return mergeTargetRoleMarket(remote, fallback)
}
