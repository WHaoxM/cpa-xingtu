import { getApiMode } from './config'
import { mockGet } from './adapters/mockAdapter'
import type { User } from '@/types'
import { UserRole } from '@/types'
import { getApiBaseUrl } from './config'
import { ApiError } from './types'

type AuthUserRow = {
  id: string
  username: string
  password?: string
  name: string
  email: string
  avatar?: string
  role: string
  createdAt: string
  status: 'active' | 'disabled'
  classId?: string
  phone?: string
}

function mapUser(row: AuthUserRow): User & { password?: string } {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    email: row.email,
    avatar: row.avatar,
    role: row.role === 'admin' ? UserRole.ADMIN : UserRole.STUDENT,
    createdAt: row.createdAt,
    status: row.status,
    classId: row.classId,
    phone: row.phone,
    password: row.password,
  }
}

const httpAuth = getApiMode() === 'http'
let csrfToken = ''

async function accountRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = getApiBaseUrl()
  const url = `${base}/api/auth${path}`
  const response = await fetch(url, { ...init, credentials: 'include', headers: {
    Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}),
    ...(init.method && init.method !== 'GET' ? { 'X-CSRFToken': csrfToken } : {}),
    ...init.headers,
  } })
  const body = await response.json().catch(() => ({})) as Record<string, unknown>
  if (!response.ok) throw new ApiError(String(body.error ?? `HTTP ${response.status}`), response.status, body, 'http')
  return body as T
}

async function ensureCsrf(): Promise<void> {
  const result = await accountRequest<{ csrfToken?: string }>('/csrf')
  if (!result.csrfToken) throw new Error('认证服务未返回 CSRF token')
  csrfToken = result.csrfToken
}

export async function getAccountCsrfToken(): Promise<string> {
  if (!httpAuth) return ''
  if (!csrfToken) await ensureCsrf()
  return csrfToken
}

function accountUser(row: { id: string; username: string; name?: string | null; role: string }): User {
  return { id: row.id, username: row.username, name: row.name || row.username,
    email: '', role: row.role === 'admin' ? UserRole.ADMIN : UserRole.STUDENT,
    createdAt: new Date().toISOString().slice(0, 10), status: 'active' }
}

/** Demo auth remains fixture-backed; HTTP auth uses the platform account session. */
export async function listAuthUsers(): Promise<Array<User & { password?: string }>> {
  if (httpAuth) return []
  const env = await mockGet<AuthUserRow[]>('auth/users.json')
  return (env.data ?? []).map(mapUser)
}

export async function loginLocal(
  username: string,
  password: string,
): Promise<(User & { password?: string }) | null> {
  if (httpAuth) {
    await ensureCsrf()
    const result = await accountRequest<{ user: { id: string; username: string; name?: string | null; role: string } }>('/login', {
      method: 'POST', body: JSON.stringify({ username, password }),
    })
    return accountUser(result.user)
  }
  const users = await listAuthUsers()
  const user = users.find(u => u.username === username)
  if (!user) return null
  if ((user.password ?? '123456') !== password) return null
  const { password: _pw, ...safe } = user
  void _pw
  return safe
}

export async function logoutAccount(): Promise<void> {
  if (!httpAuth) return
  if (!csrfToken) await ensureCsrf()
  await accountRequest('/logout', { method: 'POST' })
  csrfToken = ''
}

export async function currentAccount(): Promise<User> {
  const result = await accountRequest<{ user: { id: string; username: string; name?: string | null; role: string } }>('/me')
  return accountUser(result.user)
}

export async function registerAccount(username: string, password: string, name: string): Promise<void> {
  if (!httpAuth) throw new Error('注册仅适用于后端账号模式')
  await ensureCsrf()
  await accountRequest('/register', { method: 'POST', body: JSON.stringify({ username, password, name }) })
}
