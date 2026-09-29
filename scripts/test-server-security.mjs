import { spawn } from 'node:child_process'
import assert from 'node:assert/strict'
import { WebSocket } from 'ws'

// Exercise the deployable server with real WebSocket frames and no production data.
const child = spawn(process.execPath, ['server-dist/index.js'], {
  env: { ...process.env, PORT: '0', HOST: '127.0.0.1', EMIFOOT_BASE_PATH: '/emifoot/' },
  stdio: ['ignore', 'pipe', 'pipe'],
})
const sockets = []
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
let stage = 'server startup'
let serverErrors = ''
child.stderr.on('data', (data) => { serverErrors = (serverErrors + data).slice(-2000) })
const deadline = setTimeout(() => { child.kill(); throw new Error(`Transport checks timed out during ${stage}. ${serverErrors}`) }, 15_000)
try {
  const port = await new Promise((resolve, reject) => {
    child.stdout.once('data', (data) => {
      const match = data.toString().match(/127\.0\.0\.1:(\d+)/)
      if (match) resolve(Number(match[1]))
      else reject(new Error('Missing listening port'))
    })
    child.once('exit', (code) => reject(new Error(`Server exited ${code}`)))
  })
  const url = `ws://127.0.0.1:${port}/emifoot/ws`
  async function connect() {
    const ws = new WebSocket(url)
    sockets.push(ws)
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject) })
    return ws
  }
  const next = (ws) => new Promise((resolve) => ws.once('message', (data) => resolve(JSON.parse(data))))
  const roomCount = async () => (await (await fetch(`http://127.0.0.1:${port}/health`, { signal: AbortSignal.timeout(3000) })).json()).rooms
  stage = 'normal gameplay and retention'
  const host = await connect()
  let message = next(host)
  host.send(JSON.stringify({ type: 'create-private', name: 'Transport check' }))
  const welcome = await message
  message = next(host)
  host.send(JSON.stringify({ type: 'start-room', expectedRevision: welcome.snapshot.revision }))
  const started = await message
  assert.equal(started.snapshot.status, 'playing')
  assert.ok(Buffer.byteLength(JSON.stringify(started)) < 4 * 1024 * 1024)
  const closedHost = new Promise((resolve) => host.once('close', resolve))
  host.close(); await closedHost; await delay(20)
  assert.equal(await roomCount(), 1)

  for (const kind of ['message', 'ping', 'pong']) {
    stage = `${kind} flood`
    const ws = await connect()
    const normalPong = new Promise((resolve) => ws.once('pong', resolve))
    ws.ping('normal heartbeat')
    assert.equal((await normalPong).toString(), 'normal heartbeat')
    message = next(ws)
    ws.send(JSON.stringify({ type: 'join-open', name: 'Flood check' }))
    await message
    assert.equal(await roomCount(), 2)
    for (let i = 0; i < 25; i += 1) {
      if (kind === 'message') ws.send('{')
      else ws[kind]('bounded control-frame check')
    }
    // Assert server-side cleanup, not how quickly the flooding peer observes a
    // TCP reset. That notification is timing-dependent on macOS loopback.
    const expires = Date.now() + 3000
    while (await roomCount() !== 1 && Date.now() < expires) await delay(20)
    assert.equal(await roomCount(), 1)
    ws.terminate()
  }
  stage = 'connection cap and recovery'
  const group = []
  for (let i = 0; i < 16; i += 1) group.push(await connect())
  const rejected = new WebSocket(url)
  sockets.push(rejected)
  rejected.on('error', () => {})
  const status = await new Promise((resolve, reject) => {
    rejected.once('unexpected-response', (_, response) => {
      resolve(response.statusCode); response.resume(); rejected.terminate()
    })
    rejected.once('open', () => reject(new Error('Connection cap bypassed')))
  })
  assert.equal(status, 429)
  await Promise.all(group.map((ws) => new Promise((resolve) => { ws.once('close', resolve); ws.close() })))
  await delay(20)
  const recovered = await connect()
  recovered.close()
  console.log('PASS: normal gameplay and ping, private league retention, empty public lobby cleanup, message/ping/pong floods, connection cap and recovery')
} finally {
  clearTimeout(deadline)
  for (const ws of sockets) ws.terminate()
  if (child.exitCode === null) await new Promise((resolve) => { child.once('exit', resolve); child.kill() })
}
