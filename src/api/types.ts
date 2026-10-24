export type ApiEnvelope<T = unknown> = {
  success: boolean
  data?: T
  error?: string
  message?: string
  count?: number
  total?: number
  limit?: number
  offset?: number
}

export class ApiError extends Error {
  status: number
  body: unknown
  /** network | http | unknown — for UI branching */
  kind: 'network' | 'http' | 'unknown'

  constructor(
    message: string,
    status = 0,
    body?: unknown,
    kind: 'network' | 'http' | 'unknown' = 'unknown',
  ) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.body = body
    this.kind = kind
  }
}

/** Map browser/fetch failures to product language (not raw "Failed to fetch"). */
export function toFriendlyApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err
  const raw = err instanceof Error ? err.message : String(err || '未知错误')
  const lower = raw.toLowerCase()
  if (
    lower.includes('failed to fetch')
    || lower.includes('networkerror')
    || lower.includes('load failed')
    || lower.includes('network request failed')
    || err instanceof TypeError
  ) {
    return new ApiError(
      '无法连接后端服务。请检查服务状态或稍后重试。',
      0,
      err,
      'network',
    )
  }
  if (lower.includes('aborted') || lower.includes('timeout')) {
    return new ApiError('请求超时或已取消，请重试。', 0, err, 'network')
  }
  return new ApiError(raw || '请求失败', 0, err, 'unknown')
}
