import http from 'node:http'
import { randomUUID, createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { fileURLToPath } from 'node:url'
import { createGameHub } from './lib/game-hub.mjs'
import { createLeaderboards } from './lib/leaderboards.mjs'
import { createOriginPolicy } from './lib/origin-policy.mjs'

const MAX_FRAME_BYTES = 16 * 1024
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'

function frame(opcode, payload = Buffer.alloc(0)) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload)
  let header
  if (body.length < 126) header = Buffer.from([0x80 | opcode, body.length])
  else if (body.length <= 0xffff) { header = Buffer.alloc(4); header[0] = 0x80 | opcode; header[1] = 126; header.writeUInt16BE(body.length, 2) }
  else { header = Buffer.alloc(10); header[0] = 0x80 | opcode; header[1] = 127; header.writeBigUInt64BE(BigInt(body.length), 2) }
  return Buffer.concat([header, body])
}

function closeSocket(socket, code = 1000, reason = '') {
  if (socket.destroyed) return
  const message = Buffer.from(reason).subarray(0, 120)
  const payload = Buffer.alloc(2 + message.length)
  payload.writeUInt16BE(code, 0); message.copy(payload, 2)
  socket.end(frame(8, payload))
}

const isLoopback = host => ['127.0.0.1', 'localhost', '::1'].includes(host)

export function createLocalGameServer({ port = Number(process.env.PORT || 8765), host = process.env.HOST || '127.0.0.1', countdownMs = 3000, allowedOrigins = process.env.CORS_ALLOWED_ORIGINS || '' } = {}) {
  if (!isLoopback(host) && host !== '0.0.0.0') throw new Error('The multiplayer server can bind only to localhost, loopback, or explicitly configured 0.0.0.0.')
  const originPolicy = createOriginPolicy(allowedOrigins, { allowLoopback: isLoopback(host) })
  const hub = createGameHub({ countdownMs })
  const serverDir = fileURLToPath(new URL('.', import.meta.url))
  const leaderboards = createLeaderboards({ filePath: join(serverDir, 'data', 'leaderboards.json') })
  const connections = new Map()
  const server = http.createServer(async (request, response) => {
    const origin = request.headers.origin
    const originAllowed = originPolicy.permits(origin)
    if (origin && originAllowed) {
      response.setHeader('access-control-allow-origin', origin)
      response.setHeader('vary', 'Origin')
      response.setHeader('access-control-allow-methods', 'GET, POST, OPTIONS')
      response.setHeader('access-control-allow-headers', 'content-type')
    }
    if (request.method === 'OPTIONS') { response.writeHead(originAllowed ? 204 : 403); response.end(); return }
    const requestUrl = new URL(request.url || '/', 'http://localhost')
    const leaderboardPath = /^\/api\/leaderboards\/([a-z-]+)$/.exec(requestUrl.pathname)
    if (leaderboardPath && ['GET', 'POST'].includes(request.method)) {
      if (!originAllowed) { response.writeHead(403); response.end(); return }
      const game = leaderboardPath[1]
      const difficulty = requestUrl.searchParams.get('difficulty') || undefined
      if (request.method === 'GET') {
        const data = await leaderboards.list(game, difficulty)
        const code = data?.error === 'BAD_DIFFICULTY' ? 400 : data ? 200 : 404
        response.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
        response.end(JSON.stringify(data || { error: 'UNKNOWN_GAME' })); return
      }
      let raw = ''
      for await (const chunk of request) {
        raw += chunk
        if (Buffer.byteLength(raw) > 4096) { response.writeHead(413); response.end(); return }
      }
      let payload
      try { payload = JSON.parse(raw) } catch { response.writeHead(400, { 'content-type': 'application/json' }); response.end('{"error":"BAD_JSON"}'); return }
      if (game === 'minesweeper' && difficulty && payload && typeof payload === 'object' && !Array.isArray(payload)) payload.difficulty ??= difficulty
      const result = await leaderboards.submit(game, payload)
      const code = result.error === 'UNKNOWN_GAME' ? 404 : result.error ? 400 : 200
      response.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      response.end(JSON.stringify(result)); return
    }
    if (request.method === 'GET' && request.url === '/health') {
      response.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
      response.end(JSON.stringify({ status: 'ok', service: 'public-tools-games', websocketPath: '/ws', bind: host }))
      return
    }
    response.writeHead(404, { 'content-type': 'application/json' }); response.end('{"error":"not_found"}')
  })
  server.on('upgrade', (request, socket) => {
    if (!originPolicy.permits(request.headers.origin)) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return
    }
    const key = request.headers['sec-websocket-key']
    const valid = request.url === '/ws' && request.headers.upgrade?.toLowerCase() === 'websocket' && request.headers['sec-websocket-version'] === '13' && typeof key === 'string'
    if (!valid) { socket.write('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n'); socket.destroy(); return }
    const accept = createHash('sha1').update(key + GUID).digest('base64')
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`)
    const id = randomUUID()
    const client = { socket, buffer: Buffer.alloc(0), closed: false }
    connections.set(id, client)
    hub.connect(id, data => {
      if (socket.destroyed || client.closed) return
      try { socket.write(frame(1, JSON.stringify(data))) } catch { socket.destroy() }
    })

    socket.on('data', chunk => {
      client.buffer = Buffer.concat([client.buffer, chunk])
      if (client.buffer.length > MAX_FRAME_BYTES + 14) return closeSocket(socket, 1009, 'Message too large')
      while (client.buffer.length >= 2) {
        const first = client.buffer[0], second = client.buffer[1]
        const fin = (first & 0x80) !== 0, opcode = first & 0x0f, masked = (second & 0x80) !== 0
        let length = second & 0x7f, offset = 2
        if (length === 126) { if (client.buffer.length < 4) return; length = client.buffer.readUInt16BE(2); offset = 4 }
        else if (length === 127) {
          if (client.buffer.length < 10) return
          const wide = client.buffer.readBigUInt64BE(2)
          if (wide > BigInt(MAX_FRAME_BYTES)) return closeSocket(socket, 1009, 'Message too large')
          length = Number(wide); offset = 10
        }
        if (!masked || !fin) return closeSocket(socket, 1002, 'Invalid frame')
        if (length > MAX_FRAME_BYTES) return closeSocket(socket, 1009, 'Message too large')
        const maskOffset = offset
        if (client.buffer.length < offset + 4 + length) return
        const mask = client.buffer.subarray(maskOffset, maskOffset + 4)
        const payload = Buffer.from(client.buffer.subarray(maskOffset + 4, maskOffset + 4 + length))
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3]
        client.buffer = client.buffer.subarray(maskOffset + 4 + length)
        if (opcode === 8) { closeSocket(socket); return }
        if (opcode === 9) { socket.write(frame(10, payload)); continue }
        if (opcode !== 1) return closeSocket(socket, 1003, 'Text JSON messages only')
        try { hub.handle(id, JSON.parse(payload.toString('utf8'))) }
        catch { hub.handle(id, { type: '__invalid__' }) }
      }
    })
    socket.on('close', () => { if (!client.closed) { client.closed = true; connections.delete(id); hub.disconnect(id) } })
    socket.on('error', () => { if (!client.closed) { client.closed = true; connections.delete(id); hub.disconnect(id) } })
  })
  return { server, hub, listen: () => new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => { server.removeListener('error', reject); resolve(server.address()) })
  }), close: () => new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const service = createLocalGameServer()
  service.listen().then(address => process.stdout.write(`Public games WebSocket listening at ws://${address.address}:${address.port}/ws\n`))
    .catch(error => { process.stderr.write(`${error.message}\n`); process.exitCode = 1 })
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => service.close().finally(() => process.exit(0)))
}
