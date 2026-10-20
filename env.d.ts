/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_APP_TITLE?: string
  /**
   * `mock` = fixtures only（Pages / 无后端）
   * `http` = 真实 API（本地联调）
   * 未设置时：生产默认 mock，开发默认 http
   */
  readonly VITE_API_MODE?: 'mock' | 'http' | string
  /**
   * Backend origin for direct calls, e.g. http://host:port
   * Empty string → same-origin `/api` via Vite proxy
   */
  readonly VITE_API_BASE_URL?: string
  /** Public platform origin used to send non-landing routes to the app host. */
  readonly VITE_PLATFORM_ORIGIN?: string
  /** Dev-server proxy target (any host:port); only used by vite.config.ts */
  readonly VITE_API_PROXY_TARGET?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
