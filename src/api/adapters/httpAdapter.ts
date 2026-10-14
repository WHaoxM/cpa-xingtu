import { getApiBaseUrl } from '../config'
import { getAccountCsrfToken } from '../auth'
import { ApiError, toFriendlyApiError, type ApiEnvelope } from '../types'

type Query = Record<string, string | number | boolean | undefined | null>

async function fetchJson(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { credentials: 'include', ...init })
  } catch (err) {
    throw toFriendlyApiError(err)
  }
}

function buildUrl(path: string, query?: Query): string {
  let url: URL
  if (path.startsWith('http://') || path.startsWith('https://')) {
    url = new URL(path)
  } else {
    const base = getApiBaseUrl()
    const normalized = path.startsWith('/') ? path : `/${path}`
    if (base) {
      url = new URL(`${base}${normalized}`)
    } else {
      // same-origin → Vite dev proxy（或同源部署）
      url = new URL(normalized, typeof window !== 'undefined' ? window.location.origin : 'http://localhost')
    }
  }
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v === undefined || v === null || v === '') continue
      url.searchParams.set(k, String(v))
    }
  }
  return url.toString()
}

async function parse<T>(res: Response): Promise<ApiEnvelope<T>> {
  const text = await res.text()
  let body: unknown = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = text
  }
  if (!res.ok) {
    const msg =
      typeof body === 'object' && body && 'error' in body
        ? String((body as { error: unknown }).error)
        : res.status === 502 || res.status === 503 || res.status === 504
          ? '后端暂时不可用（网关/代理错误），请确认服务已启动后重试。'
          : `HTTP ${res.status}`
    throw new ApiError(msg, res.status, body, 'http')
  }
  return (body ?? { success: true }) as ApiEnvelope<T>
}

export async function httpGet<T = unknown>(path: string, query?: Query): Promise<ApiEnvelope<T>> {
  const res = await fetchJson(buildUrl(path, query), {
    method: 'GET',
    headers: { Accept: 'application/json' },
  })
  return parse<T>(res)
}

export async function httpSend<T = unknown>(
  method: 'POST' | 'PUT' | 'DELETE' | 'PATCH',
  path: string,
  body?: unknown,
  query?: Query,
): Promise<ApiEnvelope<T>> {
  const csrfToken = await getAccountCsrfToken()
  const res = await fetchJson(buildUrl(path, query), {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  return parse<T>(res)
}

export async function httpPost<T = unknown>(path: string, body?: unknown, query?: Query) {
  return httpSend<T>('POST', path, body, query)
}

export async function httpDelete<T = unknown>(path: string, query?: Query) {
  return httpSend<T>('DELETE', path, undefined, query)
}

/** multipart/form-data — do not set Content-Type (browser sets boundary) */
export async function httpFormPost<T = unknown>(
  path: string,
  form: FormData,
  query?: Query,
): Promise<ApiEnvelope<T>> {
  const csrfToken = await getAccountCsrfToken()
  const res = await fetchJson(buildUrl(path, query), {
    method: 'POST',
    headers: { Accept: 'application/json', ...(csrfToken ? { 'X-CSRFToken': csrfToken } : {}) },
    body: form,
  })
  return parse<T>(res)
}
