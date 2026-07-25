export type ApiMode = 'mock' | 'http'

/**
 * API 模式：
 * - `mock`：只读 `public/fixtures` + 本地 stub，不请求后端
 * - `http`：走真实 `/api`（开发联调）
 *
 * 解析顺序：`VITE_API_MODE` → 生产默认 mock → 开发默认 http
 */
export function getApiMode(): ApiMode {
  const raw = String(import.meta.env.VITE_API_MODE ?? '').trim().toLowerCase()
  if (raw === 'mock') return 'mock'
  if (raw === 'http') return 'http'
  // Pages / 静态产物未显式配置时，默认 mock，避免空白页去打不存在的后端
  return import.meta.env.PROD ? 'mock' : 'http'
}

/** 是否处于纯演示 / fixture 模式（不走后端接口） */
export function isMockMode(): boolean {
  return getApiMode() === 'mock'
}

/**
 * Backend origin without trailing slash.
 * - Empty / unset in http mode → same-origin relative `/api/...`（经 Vite proxy）
 * - Absolute URL → 直连该 origin
 */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_BASE_URL
  if (raw === undefined || raw === null) {
    return getApiMode() === 'http' ? '' : 'http://127.0.0.1:5001'
  }
  const trimmed = String(raw).trim()
  if (trimmed === '' || trimmed === '/' || trimmed === '.') {
    return ''
  }
  return trimmed.replace(/\/$/, '')
}

/** Vite BASE_URL always ends with `/`. */
export function getPublicBaseUrl(): string {
  return import.meta.env.BASE_URL || '/'
}

export const DEMO_STUDENT_ID = 'student_001'
