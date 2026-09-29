import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMultiplayer } from './useMultiplayer'
import { readSavedLeagues, readLeagueCredentials, rememberLeague } from './sessions'
import type { MultiplayerSnapshot, ServerMessage } from './protocol'

class Socket extends EventTarget {
  static OPEN = 1
  static CONNECTING = 0
  static instances: Socket[] = []
  readyState = 0
  sent: Record<string, unknown>[] = []
  constructor() { super(); Socket.instances.push(this) }
  send(data: string) { this.sent.push(JSON.parse(data)) }
  open() { this.readyState = 1; this.dispatchEvent(new Event('open')) }
  receive(message: ServerMessage) { this.dispatchEvent(new MessageEvent('message', { data: JSON.stringify(message) })) }
  close(code = 1000) { this.readyState = 3; this.dispatchEvent(new CloseEvent('close', { code })) }
}
const snapshot: MultiplayerSnapshot = {
  code: 'ABC234', mode: 'private', status: 'playing', revision: 1, hostId: 'manager-1',
  players: [{ id: 'manager-1', name: 'Emiliano', clubName: 'Remo', clubId: 'remo', connected: true, ready: false, isHost: true }],
  chat: [], submittedPlayerIds: [], notice: '',
}
const token = 'a-long-reconnect-token-for-this-test'
function welcome(socket: Socket) {
  socket.open()
  socket.receive({ type: 'welcome', playerId: 'manager-1', reconnectToken: token, snapshot })
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.stubGlobal('WebSocket', Socket)
  Socket.instances = []
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => {
  cleanup()
  vi.clearAllTimers()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('persistent multiplayer sessions', () => {
  it('resumes the same identity after closing a tab, and preserves the session on exit to the menu', () => {
    const first = renderHook(useMultiplayer)
    act(() => first.result.current.createPrivate('Emiliano'))
    act(() => welcome(Socket.instances[0]))
    expect(readSavedLeagues()[0]).toMatchObject({ code: 'ABC234', name: 'Emiliano', clubName: 'Remo' })
    first.unmount()
    act(() => vi.advanceTimersByTime(1))
    sessionStorage.clear()
    const second = renderHook(useMultiplayer)
    act(() => { expect(second.result.current.resumeRoom('abc234')).toBe(true) })
    const socket = Socket.instances[1]
    act(() => socket.open())
    expect(socket.sent[0]).toEqual({ type: 'resume', code: 'ABC234', token })
    act(() => socket.receive({ type: 'welcome', playerId: 'manager-1', reconnectToken: token, snapshot }))
    expect(second.result.current.playerId).toBe('manager-1')
    act(() => second.result.current.leaveRoom())
    expect(readSavedLeagues()).toHaveLength(1)
  })

  it('automatically reconnects after a network drop using the saved seat', () => {
    const hook = renderHook(useMultiplayer)
    act(() => hook.result.current.createPrivate('Emiliano'))
    act(() => welcome(Socket.instances[0]))
    act(() => Socket.instances[0].close(1006))
    act(() => vi.advanceTimersByTime(1200))
    expect(Socket.instances).toHaveLength(2)
    act(() => Socket.instances[1].open())
    expect(Socket.instances[1].sent[0]).toEqual({ type: 'resume', code: 'ABC234', token })
  })

  it('stops reconnecting when another tab takes control and ignores stale socket messages', () => {
    const hook = renderHook(useMultiplayer)
    act(() => hook.result.current.createPrivate('Emiliano'))
    const socket = Socket.instances[0]
    act(() => welcome(socket))
    act(() => socket.close(4001))
    act(() => vi.advanceTimersByTime(60_000))
    expect(Socket.instances).toHaveLength(1)
    expect(hook.result.current.message).toContain('OUTRA ABA')
    act(() => socket.receive({ type: 'snapshot', snapshot: { ...snapshot, revision: 100 } }))
    expect(hook.result.current.snapshot?.revision).toBe(1)
    expect(readSavedLeagues()).toHaveLength(1)
  })

  it('removes an expired session, reports why, and lets the player start again', () => {
    rememberLeague(snapshot, 'manager-1', token)
    const hook = renderHook(useMultiplayer)
    act(() => { hook.result.current.resumeRoom('ABC234') })
    act(() => Socket.instances[0].open())
    act(() => Socket.instances[0].receive({ type: 'error', code: 'resume-unavailable', message: 'LIGA EXPIRADA' }))
    expect(readSavedLeagues()).toHaveLength(0)
    expect(hook.result.current.message).toBe('LIGA EXPIRADA')
    act(() => vi.advanceTimersByTime(60_000))
    expect(Socket.instances).toHaveLength(1)
    act(() => hook.result.current.joinOpen('Emiliano'))
    act(() => Socket.instances[1].open())
    expect(Socket.instances[1].sent[0]).toEqual({ type: 'join-open', name: 'Emiliano' })
  })

  it('resumes saved invitations instead of creating a duplicate manager and migrates old tab credentials', () => {
    sessionStorage.setItem('emifoot:multiplayer:ABC234', JSON.stringify({ code: 'ABC234', token }))
    const hook = renderHook(useMultiplayer)
    act(() => hook.result.current.joinPrivate('ABC234', 'Another name'))
    act(() => welcome(Socket.instances[0]))
    expect(Socket.instances[0].sent[0]).toEqual({ type: 'resume', code: 'ABC234', token })
    sessionStorage.clear()
    expect(readLeagueCredentials('ABC234')?.token).toBe(token)
  })

  it('handles malformed and unavailable browser storage without crashing', () => {
    localStorage.setItem('emifoot:leagues:v1', '{invalid')
    expect(readSavedLeagues()).toEqual([])
    localStorage.setItem('emifoot:leagues:v1', JSON.stringify([{ code: 'ABC234', token: 'invalid' }]))
    expect(readLeagueCredentials('ABC234')).toBeUndefined()
    const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota') })
    const hook = renderHook(useMultiplayer)
    act(() => hook.result.current.createPrivate('Emiliano'))
    act(() => welcome(Socket.instances[0]))
    expect(hook.result.current.snapshot?.code).toBe('ABC234')
    spy.mockRestore()
  })
})
