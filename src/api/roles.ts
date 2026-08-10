/**
 * 角色 API 服务
 */

import { httpGet, httpPost } from './adapters/httpAdapter'
import { mockGet } from './adapters/mockAdapter'
import { getApiMode } from './config'

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
    return mockGet('/api/roles/list') as Promise<{ roles: RoleListItem[]; total: number }>
  }
  return httpGet('/api/roles/list')
}

/**
 * 获取指定角色详情
 */
export async function getRole(roleId: string): Promise<RoleDetail> {
  if (getApiMode() === 'mock') {
    return mockGet(`/api/roles/${roleId}`) as Promise<RoleDetail>
  }
  return httpGet(`/api/roles/${roleId}`)
}

/**
 * 获取角色问候语
 */
export async function getRoleGreeting(roleId: string): Promise<RoleGreeting> {
  if (getApiMode() === 'mock') {
    return mockGet(`/api/roles/${roleId}/greeting`) as Promise<RoleGreeting>
  }
  return httpGet(`/api/roles/${roleId}/greeting`)
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
