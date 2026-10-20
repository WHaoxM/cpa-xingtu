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
