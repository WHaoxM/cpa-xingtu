/**
 * Build a same-route redirect to the configured platform origin.
 * The configured value is public deployment configuration, not a secret.
 */
export function resolvePlatformRedirectUrl(
  configuredOrigin: string | undefined,
  currentOrigin: string,
  fullPath: string,
): string | null {
  const configured = configuredOrigin?.trim()
  if (!configured) return null

  try {
    const platform = new URL(configured)
    if (
      platform.protocol !== 'https:'
      || platform.username
      || platform.password
      || platform.pathname !== '/'
      || platform.search
      || platform.hash
    ) return null

    const current = new URL(currentOrigin)
    if (current.origin === platform.origin) return null
    if (!fullPath.startsWith('/') || fullPath.startsWith('//') || fullPath.startsWith('/\\')) return null

    const target = new URL(fullPath, platform.origin)
    if (target.origin !== platform.origin) return null
    return target.href
  } catch {
    return null
  }
}

/**
 * A marketing hostname is separate from the configured platform origin.
 * Keep its public root visible even when the visitor already has a session;
 * app routes still redirect to the platform through resolvePlatformRedirectUrl.
 */
export function isSeparatePlatformOrigin(
  configuredOrigin: string | undefined,
  currentOrigin: string,
): boolean {
  return resolvePlatformRedirectUrl(configuredOrigin, currentOrigin, '/') !== null
}
