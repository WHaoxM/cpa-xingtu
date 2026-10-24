import type { User } from '@/types'
import { getApiBaseUrl, getApiMode } from './config'
import { httpGet, httpSend } from './adapters/httpAdapter'
import { getAccountCsrfToken } from './auth'
import { ApiError } from './types'

export interface AccountProfile {
  id: string
  username: string
  name: string | null
  email: string | null
  phone: string | null
  signature: string | null
  role: string | null
  status: string | null
  createdAt: string | null
  lastLoginAt: string | null
  authMethod: 'account_password' | 'demo_account' | null
  revision: number
}

export interface ProfileDraft {
  name: string
  email: string
  phone: string
  signature: string
}

export type PreferenceValue = boolean | null
export interface NotificationDraft {
  email: PreferenceValue
  system: PreferenceValue
  sms: PreferenceValue
}

export interface NotificationPreferences {
  configured: boolean
  preferences: NotificationDraft
  revision: number
  channels: Record<keyof NotificationDraft, { available: boolean; reason: string }>
}

type ProfileResponse = { profile: Omit<AccountProfile, 'createdAt' | 'lastLoginAt' | 'authMethod'> & {
  created_at: string | null
  last_login_at: string | null
  auth_method: 'account_password' | null
} }

function profileFromWire(profile: ProfileResponse['profile']): AccountProfile {
  return {
    ...profile,
    createdAt: profile.created_at,
    lastLoginAt: profile.last_login_at,
    authMethod: profile.auth_method,
  }
}

function demoAccountId(user: User | null): string {
  if (!user?.id) throw new ApiError('演示账号身份不可用，请重新登录。')
  return encodeURIComponent(user.id)
}

function readLocal<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) as T : null
  } catch {
    return null
  }
}

function writeLocal<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    throw new ApiError('本机演示资料无法保存，请检查浏览器存储空间后重试。')
  }
}

function demoProfileKey(user: User | null): string {
  return `cpa-demo-account-profile:${demoAccountId(user)}`
}

function demoNotificationKey(user: User | null): string {
  return `cpa-demo-account-notifications:${demoAccountId(user)}`
}

function demoChannels(): NotificationPreferences['channels'] {
  const reason = '演示模式不会发送或订阅真实通知'
  return {
    email: { available: false, reason },
    system: { available: false, reason },
    sms: { available: false, reason },
  }
}

export async function getAccountProfile(user: User | null): Promise<AccountProfile> {
  if (getApiMode() === 'http') {
    const response = await httpGet<ProfileResponse>('/api/auth/profile')
    if (!response.data?.profile) throw new ApiError('账号资料响应缺少资料记录。')
    return profileFromWire(response.data.profile)
  }

  const id = demoAccountId(user)
  const saved = readLocal<AccountProfile>(`cpa-demo-account-profile:${id}`)
  return saved ?? {
    id: user!.id,
    username: user!.username,
    name: user!.name || null,
    email: user!.email || null,
    phone: user!.phone || null,
    signature: user!.signature || null,
    role: user!.role || null,
    status: user!.status || null,
    createdAt: user!.createdAt || null,
    lastLoginAt: null,
    authMethod: 'demo_account',
    revision: 0,
  }
}

export async function saveAccountProfile(
  user: User | null,
  draft: ProfileDraft,
  expectedRevision: number,
): Promise<AccountProfile> {
  if (getApiMode() === 'http') {
    const response = await httpSend<ProfileResponse>('PATCH', '/api/auth/profile', {
      expected_revision: expectedRevision,
      name: draft.name,
      email: draft.email,
      phone: draft.phone,
      signature: draft.signature,
    })
    if (!response.data?.profile) throw new ApiError('账号资料保存响应缺少回读记录。')
    return profileFromWire(response.data.profile)
  }

  const existing = await getAccountProfile(user)
  if (existing.revision !== expectedRevision) {
    throw new ApiError('资料已在其他演示页面更新，请刷新后重试。', 409)
  }
  const saved = { ...existing, ...draft, revision: existing.revision + 1 }
  writeLocal(demoProfileKey(user), saved)
  return saved
}

const emptyPreferences: NotificationDraft = { email: null, system: null, sms: null }

function preferenceConfigured(preferences: NotificationDraft): boolean {
  return Object.values(preferences).some(value => value !== null)
}

export async function getNotificationPreferences(user: User | null): Promise<NotificationPreferences> {
  if (getApiMode() === 'http') {
    const response = await httpGet<Omit<NotificationPreferences, 'channels'> & {
      channels: NotificationPreferences['channels']
    }>('/api/auth/notification-preferences')
    if (!response.data?.preferences) throw new ApiError('通知偏好响应格式不正确。')
    return {
      configured: response.data.configured,
      preferences: response.data.preferences,
      revision: response.data.revision,
      channels: response.data.channels,
    }
  }

  const stored = readLocal<{ preferences: NotificationDraft; revision: number }>(demoNotificationKey(user))
  const preferences = stored?.preferences ?? emptyPreferences
  return {
    configured: preferenceConfigured(preferences),
    preferences,
    revision: stored?.revision ?? 0,
    channels: demoChannels(),
  }
}

export async function saveNotificationPreferences(
  user: User | null,
  preferences: NotificationDraft,
  expectedRevision: number,
): Promise<NotificationPreferences> {
  if (getApiMode() === 'http') {
    const response = await httpSend<Omit<NotificationPreferences, 'channels'> & {
      channels: NotificationPreferences['channels']
    }>('PUT', '/api/auth/notification-preferences', {
      expected_revision: expectedRevision,
      preferences,
    })
    if (!response.data?.preferences) throw new ApiError('通知偏好保存响应格式不正确。')
    return {
      configured: response.data.configured,
      preferences: response.data.preferences,
      revision: response.data.revision,
      channels: response.data.channels,
    }
  }

  const current = await getNotificationPreferences(user)
  if (current.revision !== expectedRevision) {
    throw new ApiError('通知偏好已在其他演示页面更新，请刷新后重试。', 409)
  }
  const saved = { ...preferences }
  const result = {
    configured: preferenceConfigured(saved),
    preferences: saved,
    revision: current.revision + 1,
    channels: demoChannels(),
  }
  writeLocal(demoNotificationKey(user), {
    preferences: result.preferences,
    revision: result.revision,
  })
  return result
}

export async function changeAccountPassword(currentPassword: string, newPassword: string): Promise<void> {
  if (getApiMode() !== 'http') {
    throw new ApiError('演示模式不支持修改真实账号密码。', 501)
  }
  const csrfToken = await getAccountCsrfToken()
  const url = `${getApiBaseUrl()}/api/auth/change-password`
  let response: Response
  try {
    response = await fetch(url, {
      method: 'POST',
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'X-CSRFToken': csrfToken,
      },
      body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
    })
  } catch (error) {
    throw new ApiError('无法连接账号服务，请稍后重试。', 0, error, 'network')
  }
  const body = await response.json().catch(() => ({})) as { error?: unknown; reauthentication_required?: boolean }
  if (!response.ok) {
    throw new ApiError(String(body.error ?? `HTTP ${response.status}`), response.status, body, 'http')
  }
  if (!body.reauthentication_required) {
    throw new ApiError('密码变更响应未确认需要重新登录。')
  }
}
