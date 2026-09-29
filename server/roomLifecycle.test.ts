import { describe, expect, it, vi, afterEach } from 'vitest'
import { RoomCoordinator, EMPTY_ROOM_RETENTION_MS, type RoomConnection } from './roomCoordinator'
import type { ClientMessage, MultiplayerSnapshot, MultiplayerTimerKind, ServerMessage } from '../src/multiplayer/protocol'

class Connection implements RoomConnection {
  messages: ServerMessage[] = []
  close = vi.fn()
  send = (message: ServerMessage) => { this.messages.push(structuredClone(message)) }
  get snapshot(): MultiplayerSnapshot {
    const message = this.messages.findLast((item) => item.type === 'welcome' || item.type === 'snapshot')
    if (!message || (message.type !== 'welcome' && message.type !== 'snapshot')) throw new Error('Missing snapshot')
    return message.snapshot
  }
  get credentials() {
    const welcome = this.messages.find((message) => message.type === 'welcome')!
    return { code: welcome.snapshot.code, token: welcome.reconnectToken }
  }
}

function privateLeague(start = true) {
  vi.useFakeTimers()
  const coordinator = new RoomCoordinator()
  const host = new Connection()
  const guest = new Connection()
  coordinator.handle(host, { type: 'create-private', name: 'Criador' })
  coordinator.handle(guest, { type: 'join-private', code: host.snapshot.code, name: 'Convidado' })
  if (start) coordinator.handle(host, { type: 'start-room', expectedRevision: host.snapshot.revision })
  return { coordinator, host, guest }
}

function reach(connection: Connection, kind: MultiplayerTimerKind) {
  for (let count = 0; count < 600 && connection.snapshot.timer?.kind !== kind; count++) vi.advanceTimersByTime(1000)
  expect(connection.snapshot.timer?.kind).toBe(kind)
}

const command = (type: 'pause-room' | 'unpause-room' | 'start-room'): ClientMessage => ({ type, expectedRevision: 0 })
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers() })

describe('league pause and reconnection', () => {
  it.each(['club-draw', 'cup-draw', 'auction', 'auction-result', 'regular-turn', 'first-half', 'half-time', 'second-half', 'standings'] as const)(
    'freezes and restores the exact %s clock, blocks game actions, and keeps chat available', (kind) => {
      const { coordinator, host, guest } = privateLeague()
      reach(host, kind)
      vi.advanceTimersByTime(300)
      const before = host.snapshot
      coordinator.handle(guest, command('pause-room'))
      expect(guest.messages.at(-1)?.type).toBe('error')
      coordinator.handle(host, command('pause-room'))
      const paused = host.snapshot
      expect(paused.pause?.name).toBe('Criador')
      const remaining = before.timer!.endsAt - Date.now()
      expect(paused.timer?.remainingMs).toBe(remaining)
      coordinator.handle(guest, { type: 'action', expectedRevision: 0, action: { type: 'continue' } })
      expect(guest.messages.at(-1)?.type).toBe('error')
      coordinator.handle(guest, { type: 'chat', text: 'Já volto!' })
      expect(host.snapshot.chat.at(-1)?.text).toBe('Já volto!')
      vi.advanceTimersByTime(60_000)
      expect(host.snapshot.game).toEqual(before.game)
      coordinator.handle(host, command('unpause-room'))
      expect(host.snapshot.pause).toBeUndefined()
      expect(host.snapshot.timer?.endsAt).toBe(Date.now() + remaining)
      vi.advanceTimersByTime(remaining - 1)
      expect(host.snapshot.timer?.kind).toBe(kind)
      vi.advanceTimersByTime(1)
      expect(host.snapshot.timer?.kind).not.toBe(kind)
    },
  )

  it('keeps the original creator when they disconnect in the lobby, even with eight seats', () => {
    const { coordinator, host, guest } = privateLeague(false)
    const id = host.snapshot.hostId
    coordinator.disconnect(host)
    expect(guest.snapshot.hostId).toBe(id)
    coordinator.handle(guest, command('start-room'))
    expect(guest.messages.at(-1)?.type).toBe('error')
    for (let n = 0; n < 6; n++) coordinator.handle(new Connection(), { type: 'join-private', code: guest.snapshot.code, name: `Guest ${n}` })
    expect(guest.snapshot.status).toBe('waiting')
    const returning = new Connection()
    coordinator.handle(returning, { type: 'resume', ...host.credentials })
    coordinator.handle(returning, command('start-room'))
    expect(returning.snapshot.status).toBe('playing')
    expect(returning.snapshot.hostId).toBe(id)
  })

  it('keeps a manual pause when everyone leaves and only the returning creator can resume', () => {
    const { coordinator, host, guest } = privateLeague()
    vi.advanceTimersByTime(1500)
    coordinator.handle(host, command('pause-room'))
    const before = host.snapshot
    coordinator.disconnect(host)
    coordinator.disconnect(guest)
    vi.advanceTimersByTime(EMPTY_ROOM_RETENTION_MS - 1000)
    const returningGuest = new Connection()
    coordinator.handle(returningGuest, { type: 'resume', ...guest.credentials })
    expect(returningGuest.snapshot.pause).toEqual(before.pause)
    expect(returningGuest.snapshot.game?.manager.clubId).toBe(guest.snapshot.game?.manager.clubId)
    coordinator.handle(returningGuest, command('unpause-room'))
    expect(returningGuest.messages.at(-1)?.type).toBe('error')
    vi.advanceTimersByTime(10_000)
    expect(coordinator.roomCount()).toBe(1)
    const returningHost = new Connection()
    coordinator.handle(returningHost, { type: 'resume', ...host.credentials })
    expect(returningHost.snapshot.game).toEqual(before.game)
    coordinator.handle(returningHost, command('unpause-room'))
    expect(returningHost.snapshot.timer?.endsAt).toBe(Date.now() + before.timer!.remainingMs!)
  })

  it('automatically thaws an empty league and resets expiry only after another full disconnection', () => {
    const { coordinator, host, guest } = privateLeague()
    const before = guest.snapshot
    const remaining = before.timer!.endsAt - Date.now()
    coordinator.disconnect(host)
    coordinator.disconnect(guest)
    vi.advanceTimersByTime(5 * 60_000)
    const returning = new Connection()
    coordinator.handle(returning, { type: 'resume', ...guest.credentials })
    expect(returning.snapshot.game).toEqual(before.game)
    expect(returning.snapshot.timer?.endsAt).toBe(Date.now() + remaining)
    coordinator.disconnect(returning)
    vi.advanceTimersByTime(EMPTY_ROOM_RETENTION_MS - 1)
    expect(coordinator.roomCount()).toBe(1)
    vi.advanceTimersByTime(1)
    expect(coordinator.roomCount()).toBe(0)
    const expired = new Connection()
    coordinator.handle(expired, { type: 'resume', ...guest.credentials })
    expect(expired.messages.at(-1)).toMatchObject({ type: 'error', code: 'resume-unavailable' })
  })

  it('does not accept a name or room code as credentials or new entrants after kickoff', () => {
    const { coordinator, host } = privateLeague()
    const stranger = new Connection()
    coordinator.handle(stranger, { type: 'resume', code: host.snapshot.code, token: 'Criador' })
    expect(stranger.messages.at(-1)?.type).toBe('error')
    coordinator.handle(stranger, { type: 'join-private', code: host.snapshot.code, name: 'Criador' })
    expect(stranger.messages.at(-1)?.type).toBe('error')
  })
})

describe('automatic public leagues', () => {
  it('has no privileged player, restarts the countdown after cancellations, and fills at eight', () => {
    vi.useFakeTimers()
    const coordinator = new RoomCoordinator()
    const first = new Connection()
    const second = new Connection()
    coordinator.handle(first, { type: 'join-open', name: 'Primeiro' })
    expect(first.snapshot.hostId).toBeUndefined()
    expect(first.snapshot.players[0].isHost).toBe(false)
    for (const type of ['start-room', 'pause-room', 'unpause-room'] as const) {
      coordinator.handle(first, command(type))
      expect(first.messages.at(-1)?.type).toBe('error')
    }
    coordinator.handle(second, { type: 'join-open', name: 'Segundo' })
    vi.advanceTimersByTime(14_000)
    coordinator.disconnect(second)
    expect(first.snapshot.timer).toBeUndefined()
    expect(first.snapshot.players).toHaveLength(1)
    vi.advanceTimersByTime(20_000)
    expect(first.snapshot.status).toBe('waiting')
    const third = new Connection()
    coordinator.handle(third, { type: 'join-open', name: 'Terceiro' })
    expect(third.snapshot.timer?.endsAt).toBe(Date.now() + 15_000)
    for (let n = 0; n < 6; n++) coordinator.handle(new Connection(), { type: 'join-open', name: `Outro ${n}` })
    expect(first.snapshot.status).toBe('playing')
    expect(first.snapshot.players).toHaveLength(8)
    expect(new Set(first.snapshot.players.map((player) => player.clubId)).size).toBe(8)
    expect(first.snapshot.players.every((player) => !player.isHost)).toBe(true)
    const next = new Connection()
    coordinator.handle(next, { type: 'join-open', name: 'Próxima liga' })
    expect(next.snapshot.code).not.toBe(first.snapshot.code)
  })

  it('lets a public manager return to their reserved club after everyone closes the game', () => {
    vi.useFakeTimers()
    const coordinator = new RoomCoordinator()
    const first = new Connection()
    const second = new Connection()
    coordinator.handle(first, { type: 'join-open', name: 'Primeiro' })
    coordinator.handle(second, { type: 'join-open', name: 'Segundo' })
    vi.advanceTimersByTime(16_000)
    const club = first.snapshot.game!.manager.clubId
    coordinator.disconnect(first)
    coordinator.disconnect(second)
    vi.advanceTimersByTime(60_000)
    const returning = new Connection()
    coordinator.handle(returning, { type: 'resume', ...first.credentials })
    expect(returning.snapshot.game!.manager.clubId).toBe(club)
    expect(returning.snapshot.hostId).toBeUndefined()
    expect(returning.snapshot.pause).toBeUndefined()
  })
})

it('passes auctions for absent managers and keeps their valid lineup when the round starts', () => {
  const { coordinator, host, guest } = privateLeague()
  const clubId = guest.snapshot.game!.manager.clubId
  const initial = guest.snapshot.game!.clubs.find((club) => club.id === clubId)!
  coordinator.disconnect(guest)
  reach(host, 'regular-turn')
  const club = host.snapshot.game!.clubs.find((club) => club.id === clubId)!
  expect(club.players.map((player) => [player.id, player.salary])).toEqual(initial.players.map((player) => [player.id, player.salary]))
  expect(club.cash).toBe(initial.cash)
  const returning = new Connection()
  coordinator.handle(returning, { type: 'resume', ...guest.credentials })
  const lineup = [...club.lineup].reverse()
  coordinator.handle(returning, { type: 'action', expectedRevision: 0, action: {
    type: 'update-club', setup: { tactic: club.tactic, lineup, bench: club.bench },
  } })
  coordinator.disconnect(returning)
  const hostClub = host.snapshot.game!.clubs.find((candidate) => candidate.id === host.snapshot.game!.manager.clubId)!
  coordinator.handle(host, { type: 'action', expectedRevision: 0, action: {
    type: 'ready-round', setup: { tactic: hostClub.tactic, lineup: hostClub.lineup, bench: hostClub.bench },
  } })
  expect(host.snapshot.game!.phase).toBe('first-half')
  const pending = host.snapshot.game!.pendingMatchDay!.matches.find((match) => match.homeId === clubId || match.awayId === clubId)!
  expect(pending.homeId === clubId ? pending.homeLineup : pending.awayLineup).toEqual(lineup)
})
