import { APP_VERSION } from '../src/config/version'
import { serverConfig } from './config'
import { createServer } from 'node:http'
import { WebSocket, WebSocketServer } from 'ws'
import { clientMessageSchema, type ServerMessage } from '../src/multiplayer/protocol'
import { RoomCoordinator, type RoomConnection } from './roomCoordinator'
import { clientAddress, messageBudget, UpgradeLimiter } from './networkLimits'

const { port, host, basePath } = serverConfig(process.env)
const coordinator = new RoomCoordinator()

const server = createServer((request, response) => {
  if (request.url === '/health' || request.url === `${basePath}health`) {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' })
    response.end(JSON.stringify({ ok: true, version: APP_VERSION, rooms: coordinator.roomCount() }))
    return
  }
  response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ error: 'not_found' }))
})

const webSockets = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024, autoPong: false })
const upgradeLimiter = new UpgradeLimiter()
const connectionsPerAddress = new Map<string, number>()

server.on('upgrade', (request, socket, head) => {
  let pathname: string
  try {
    pathname = new URL(request.url ?? '/', 'http://localhost').pathname
  } catch {
    socket.destroy()
    return
  }
  if (pathname !== '/ws' && pathname !== `${basePath}ws`) {
    socket.destroy()
    return
  }
  const address = clientAddress(request)
  if (!upgradeLimiter.allow(address) || webSockets.clients.size >= 256 || (connectionsPerAddress.get(address) ?? 0) >= 16) {
    socket.end('HTTP/1.1 429 Too Many Requests\r\nConnection: close\r\nRetry-After: 60\r\nContent-Length: 0\r\n\r\n')
    return
  }
  webSockets.handleUpgrade(request, socket, head, (webSocket) => webSockets.emit('connection', webSocket, request))
})

webSockets.on('connection', (webSocket, request) => {
  const address = clientAddress(request)
  connectionsPerAddress.set(address, (connectionsPerAddress.get(address) ?? 0) + 1)
  const allowMessage = messageBudget()
  let alive = true
  webSocket.on('pong', () => {
    if (!allowMessage()) webSocket.terminate()
    else alive = true
  })
  webSocket.on('ping', (payload) => {
    if (!allowMessage() || webSocket.bufferedAmount + payload.length + 2 > 4 * 1024 * 1024) {
      webSocket.terminate()
      return
    }
    if (webSocket.readyState === WebSocket.OPEN) webSocket.pong(payload)
  })
  const heartbeat = setInterval(() => {
    if (!alive) {
      webSocket.terminate()
      return
    }
    alive = false
    webSocket.ping()
  }, 30_000)
  heartbeat.unref()
  const connection: RoomConnection = {
    send(message: ServerMessage) {
      if (webSocket.readyState !== WebSocket.OPEN) return
      const payload = JSON.stringify(message)
      if (webSocket.bufferedAmount + Buffer.byteLength(payload) > 4 * 1024 * 1024) {
        webSocket.terminate()
        return
      }
      webSocket.send(payload)
    },
    close() {
      webSocket.close(4001, 'Ligação substituída por uma reconexão.')
    },
  }

  webSocket.on('message', (payload) => {
    if (webSocket.readyState !== WebSocket.OPEN) return
    if (!allowMessage()) {
      webSocket.terminate()
      return
    }
    let decoded: unknown
    try {
      decoded = JSON.parse(payload.toString())
    } catch {
      connection.send({ type: 'error', message: 'MENSAGEM INVÁLIDA.' })
      return
    }
    const parsed = clientMessageSchema.safeParse(decoded)
    if (!parsed.success) {
      connection.send({ type: 'error', message: 'COMANDO DE REDE INVÁLIDO.' })
      return
    }
    coordinator.handle(connection, parsed.data)
  })
  webSocket.on('close', () => {
    clearInterval(heartbeat)
    const remaining = (connectionsPerAddress.get(address) ?? 1) - 1
    if (remaining > 0) connectionsPerAddress.set(address, remaining)
    else connectionsPerAddress.delete(address)
    coordinator.disconnect(connection)
  })
  webSocket.on('error', () => coordinator.disconnect(connection))
})

server.listen(port, host, () => {
  process.stdout.write(`Emifoot multiplayer listening on http://${host}:${(server.address() as { port: number }).port}\n`)
})

let shuttingDown = false

function shutdown(): void {
  if (shuttingDown) return
  shuttingDown = true
  for (const webSocket of webSockets.clients) webSocket.terminate()
  webSockets.close()
  server.close(() => process.exit(0))
  setTimeout(() => process.exit(0), 5_000).unref()
}

process.on('SIGTERM', shutdown)
process.on('SIGINT', shutdown)
