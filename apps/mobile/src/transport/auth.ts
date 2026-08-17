export const HERMES_HTTP_URL = 'https://mikeys-mac-mini.tailaf453c.ts.net:9443'
// This is a non-secret proxy marker. The Mac-side, tailnet-only reverse proxy
// replaces it with the real Hermes session credential.
export const HERMES_PROXY_MARKER = 'mikey-tailnet'

export function hermesWsUrl(): string {
  const url = new URL(HERMES_HTTP_URL)
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
  url.pathname = `${url.pathname.replace(/\/$/, '')}/api/ws`
  url.search = `?token=${encodeURIComponent(HERMES_PROXY_MARKER)}`
  return url.toString()
}

export async function hermesFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${HERMES_HTTP_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      'X-Hermes-Session-Token': HERMES_PROXY_MARKER,
      ...init.headers
    }
  })

  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(detail || `Hermes request failed (${response.status})`)
  }

  return (await response.json()) as T
}
