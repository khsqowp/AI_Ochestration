export type LiveServerEvent = {
  type: string
  [key: string]: unknown
}

export type LiveSocket = {
  socket: WebSocket
  send: (message: Record<string, unknown>) => void
  close: () => void
}

export const getLiveApiBaseUrl = () => import.meta.env.VITE_LIVE_API_URL || window.location.origin

export const getLiveWebSocketUrl = () => {
  const configured = import.meta.env.VITE_LIVE_WS_URL
  if (configured) return configured
  const url = new URL('/ws', window.location.origin)
  url.protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return url.toString()
}

export function connectLiveSocket(
  onEvent: (event: LiveServerEvent) => void,
  onStatus?: (status: 'connecting' | 'open' | 'closed' | 'error') => void,
  url = getLiveWebSocketUrl(),
): LiveSocket {
  const socket = new WebSocket(url)
  onStatus?.('connecting')
  socket.addEventListener('open', () => onStatus?.('open'))
  socket.addEventListener('close', () => onStatus?.('closed'))
  socket.addEventListener('error', () => onStatus?.('error'))
  socket.addEventListener('message', message => {
    if (typeof message.data !== 'string') return
    try {
      const event: unknown = JSON.parse(message.data)
      if (event && typeof event === 'object' && !Array.isArray(event) && typeof (event as LiveServerEvent).type === 'string') {
        onEvent(event as LiveServerEvent)
      }
    } catch {
      // Ignore malformed server payloads; transport status remains observable.
    }
  })
  return {
    socket,
    send: message => {
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
    },
    close: () => socket.close(),
  }
}
