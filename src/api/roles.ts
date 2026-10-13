/**
 * 角色 API 服务
 */

import { httpGet, httpPost } from './adapters/httpAdapter'
import { mockGet } from './adapters/mockAdapter'
import { getApiMode } from './config'
import type { ApiEnvelope } from './types'

// Role endpoints return a raw JSON object today; other API adapters may
// return the common {success, data} envelope. Keep one explicit boundary.
function rolePayload<T>(response: ApiEnvelope<T>): T {
  return response.data !== undefined ? response.data : response as unknown as T
}

export interface RoleListItem {
  id: string
  name: string
  title: string
  company: string
  expertise: string
}

export interface RoleDetail {
  id: string
  name: string
  title: string
  company: string
  experience: string
  expertise: string[]
  persona: {
    traits: string[]
    communication_style: string
    values: string
  }
  tools: string[]
}

export interface RoleGreeting {
  role_id: string
  greeting: string
}

export interface ChatMessage {
  role_id: string
  message: string
  session_id: string
  student_id: string
}

/**
 * 获取所有可用角色
 */
export async function listRoles(): Promise<{ roles: RoleListItem[]; total: number }> {
  if (getApiMode() === 'mock') {
    return rolePayload(await mockGet<{ roles: RoleListItem[]; total: number }>('/api/roles/list'))
  }
  return rolePayload(await httpGet<{ roles: RoleListItem[]; total: number }>('/api/roles/list'))
}

/**
 * 获取指定角色详情
 */
export async function getRole(roleId: string): Promise<RoleDetail> {
  if (getApiMode() === 'mock') {
    return rolePayload(await mockGet<RoleDetail>(`/api/roles/${roleId}`))
  }
  return rolePayload(await httpGet<RoleDetail>(`/api/roles/${roleId}`))
}

/**
 * 获取角色问候语
 */
export async function getRoleGreeting(roleId: string): Promise<RoleGreeting> {
  if (getApiMode() === 'mock') {
    return rolePayload(await mockGet<RoleGreeting>(`/api/roles/${roleId}/greeting`))
  }
  return rolePayload(await httpGet<RoleGreeting>(`/api/roles/${roleId}/greeting`))
}

/**
 * 与专家角色对话
 */
export async function chatWithRole(data: ChatMessage): Promise<any> {
  if (getApiMode() === 'mock') {
    return mockGet('/api/roles/chat') as Promise<any>
  }
  return httpPost('/api/roles/chat', data)
}
