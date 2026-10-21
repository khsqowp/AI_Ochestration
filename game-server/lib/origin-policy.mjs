function parseOrigin(value) {
  if (typeof value !== 'string' || !value || value === 'null') return null
  try {
    const url = new URL(value)
    if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value || url.username || url.password) return null
    return url
  } catch { return null }
}

export function createOriginPolicy(configured = process.env.CORS_ALLOWED_ORIGINS || '', { allowLoopback = true } = {}) {
  const allowed = new Set()
  for (const entry of configured.split(',').map(value => value.trim()).filter(Boolean)) {
    if (!parseOrigin(entry)) throw new Error(`Invalid CORS_ALLOWED_ORIGINS entry: ${entry}`)
    allowed.add(entry)
  }
  function permits(origin) {
    if (origin === undefined || origin === null || origin === '') return true
    const parsed = parseOrigin(origin)
    if (!parsed) return false
    if (allowLoopback && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname)) return true
    return allowed.has(origin)
  }
  return { permits }
}
